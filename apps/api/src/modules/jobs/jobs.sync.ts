import { sql, type Transaction } from 'kysely'
import { z } from 'zod'
import { db, type Database } from '../../core/db/index.ts'
import { env } from '../../core/env.ts'
import { flagsFor, heightOf } from '../sources/sources.classify.ts'
import { slug } from '../imports/imports.m3u.ts'
import { refreshChannelStats, refreshSearchText } from '../catalog/catalog.stats.ts'

/**
 * Pulls the iptv-org database into Postgres.
 *
 * Upstream is treated as one of several contributors rather than the truth:
 * every write is scoped to `origin = 'iptv-org' and not locked`, so a stream
 * address an operator has corrected by hand survives tonight's pull, and a
 * channel added by hand is never touched at all. That scoping is the whole
 * reason the catalog can be edited at runtime.
 */

/**
 * Upstream shapes are validated per record and bad ones are skipped. A strict
 * whole-payload parse would mean one malformed row of sixty thousand aborts
 * the night's sync, which is worse than dropping the row.
 */
const upstreamChannel = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  alt_names: z.array(z.string()).optional(),
  country: z.string().optional().nullable(),
  categories: z.array(z.string()).optional(),
  website: z.string().optional().nullable(),
  closed: z.string().nullish(),
  replaced_by: z.string().nullish(),
  is_nsfw: z.boolean().optional(),
})

const upstreamStream = z.looseObject({
  channel: z.string().nullish(),
  feed: z.string().nullish(),
  url: z.string().min(1),
  title: z.string().nullish(),
  quality: z.string().nullish(),
  user_agent: z.string().nullish(),
  referrer: z.string().nullish(),
  labels: z.array(z.string()).nullish(),
})

const upstreamFeed = z.looseObject({
  channel: z.string().min(1),
  id: z.string().min(1),
  name: z.string().nullish(),
  is_main: z.boolean().optional(),
  languages: z.array(z.string()).optional(),
})

const upstreamLogo = z.looseObject({
  channel: z.string().min(1),
  url: z.string().min(1),
  in_use: z.boolean().optional(),
  format: z.string().nullish(),
  width: z.number().nullish(),
})

const upstreamLookup = z.looseObject({
  code: z.string().optional(),
  id: z.string().optional(),
  name: z.string().min(1),
  flag: z.string().nullish(),
})

const upstreamBlock = z.looseObject({ channel: z.string().min(1) })

export interface SyncStats extends Record<string, number> {
  channels: number
  sources: number
  unmatched: number
  retired: number
  disabled: number
  skipped: number
  lookups: number
}

type Trx = Transaction<Database>

async function fetchEndpoint<T extends z.ZodType>(name: string, schema: T, skipped: { n: number }) {
  const res = await fetch(`${env.IPTV_ORG_API}/${name}.json`, {
    signal: AbortSignal.timeout(120_000),
    headers: { 'user-agent': 'tuner-sync' },
  })
  if (!res.ok) throw new Error(`${name}.json responded ${res.status}`)
  const payload: unknown = await res.json()
  if (!Array.isArray(payload)) throw new Error(`${name}.json is not an array`)

  const out: z.infer<T>[] = []
  for (const record of payload) {
    const parsed = schema.safeParse(record)
    if (parsed.success) out.push(parsed.data)
    else skipped.n++
  }
  return out
}

/** An SVG logo sorts after a raster one: more of them fail to render. */
const rasterFirst = (format?: string | null) => (format?.toUpperCase() === 'SVG' ? 1 : 0)

/** Prefer the logo most likely to render: in use, raster over SVG, then widest. */
function pickLogo(logos: z.infer<typeof upstreamLogo>[]) {
  return (
    logos.toSorted((a, b) => {
      if (Boolean(a.in_use) !== Boolean(b.in_use)) return a.in_use ? -1 : 1
      if (rasterFirst(a.format) !== rasterFirst(b.format)) {
        return rasterFirst(a.format) - rasterFirst(b.format)
      }
      return (b.width ?? 0) - (a.width ?? 0)
    })[0]?.url ?? null
  )
}

const CHUNK = 500

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

interface ChannelUpsert {
  id: string
  name: string
  alt_names: string[]
  country: string | null
  categories: string[]
  languages: string[]
  logo: string | null
  website: string | null
  origin: 'iptv-org'
  unmatched: boolean
  retired: boolean
  search_text: string
}

interface SourceUpsert {
  channel_id: string
  url: string
  quality: string | null
  height: number | null
  feed: string | null
  labels: string[]
  user_agent: string | null
  referrer: string | null
  insecure: boolean
  needs_headers: boolean
  is_dash: boolean
  origin: 'iptv-org'
}

export async function runSync(log: (m: string) => void = () => {}): Promise<SyncStats> {
  const skipped = { n: 0 }
  log('fetching iptv-org')

  const [channels, streams, feeds, logos, categories, countries, languages, blocklist] =
    await Promise.all([
      fetchEndpoint('channels', upstreamChannel, skipped),
      fetchEndpoint('streams', upstreamStream, skipped),
      fetchEndpoint('feeds', upstreamFeed, skipped),
      fetchEndpoint('logos', upstreamLogo, skipped),
      fetchEndpoint('categories', upstreamLookup, skipped),
      fetchEndpoint('countries', upstreamLookup, skipped),
      fetchEndpoint('languages', upstreamLookup, skipped),
      fetchEndpoint('blocklist', upstreamBlock, skipped),
    ])

  log(`fetched ${channels.length} channels, ${streams.length} streams`)

  const blocked = new Set(blocklist.map((b) => b.channel))

  const logosBy = new Map<string, z.infer<typeof upstreamLogo>[]>()
  for (const l of logos) {
    const list = logosBy.get(l.channel)
    if (list) list.push(l)
    else logosBy.set(l.channel, [l])
  }

  const feedsBy = new Map<string, Map<string, z.infer<typeof upstreamFeed>>>()
  for (const f of feeds) {
    const existing = feedsBy.get(f.channel)
    if (existing) existing.set(f.id, f)
    else feedsBy.set(f.channel, new Map([[f.id, f]]))
  }

  const streamsBy = new Map<string, z.infer<typeof upstreamStream>[]>()
  const orphans: z.infer<typeof upstreamStream>[] = []
  for (const s of streams) {
    if (!/^https?:\/\//i.test(s.url)) continue
    if (s.channel && blocked.has(s.channel)) continue
    if (!s.channel) {
      orphans.push(s)
      continue
    }
    const list = streamsBy.get(s.channel)
    if (list) list.push(s)
    else streamsBy.set(s.channel, [s])
  }

  const channelRows: ChannelUpsert[] = []
  const sourceRows: SourceUpsert[] = []

  const sourceFrom = (
    channelId: string,
    s: z.infer<typeof upstreamStream>,
    feedName: string | null,
  ): SourceUpsert => {
    const flags = flagsFor(s.url, s.user_agent, s.referrer)
    // Spelled out rather than spread: `flagsFor` returns camelCase names, and
    // spreading them would put columns the table does not have into the insert.
    return {
      channel_id: channelId,
      url: s.url,
      quality: s.quality ?? null,
      height: heightOf(s.quality),
      feed: feedName,
      labels: s.labels ?? [],
      user_agent: s.user_agent ?? null,
      referrer: s.referrer ?? null,
      insecure: flags.insecure,
      needs_headers: flags.needsHeaders,
      is_dash: flags.isDash,
      origin: 'iptv-org',
    }
  }

  for (const ch of channels) {
    if (ch.closed || ch.replaced_by || ch.is_nsfw || blocked.has(ch.id)) continue
    const mine = streamsBy.get(ch.id)
    if (!mine?.length) continue

    const chFeeds = feedsBy.get(ch.id)
    const langs = [
      ...new Set([...(chFeeds?.values() ?? [])].flatMap((f) => f.languages ?? [])),
    ].slice(0, 6)

    channelRows.push({
      id: ch.id,
      name: ch.name,
      alt_names: (ch.alt_names ?? []).slice(0, 8),
      country: ch.country?.toUpperCase() ?? null,
      categories: ch.categories ?? [],
      languages: langs,
      logo: pickLogo(logosBy.get(ch.id) ?? []),
      website: ch.website ?? null,
      origin: 'iptv-org',
      unmatched: false,
      retired: false,
      search_text: '',
    })

    const seen = new Set<string>()
    for (const s of mine) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      const feed = s.feed ? chFeeds?.get(s.feed) : undefined
      sourceRows.push(sourceFrom(ch.id, s, feed && !feed.is_main ? (feed.name ?? null) : null))
    }
  }

  // Streams upstream has not matched to a broadcaster still carry a usable
  // title, so they are kept and flagged rather than thrown away.
  const orphanGroups = new Map<string, z.infer<typeof upstreamStream>[]>()
  for (const s of orphans) {
    const key = s.title?.trim() || s.url
    const list = orphanGroups.get(key)
    if (list) list.push(s)
    else orphanGroups.set(key, [s])
  }

  let unmatched = 0
  for (const [title, group] of orphanGroups) {
    const id = `x:${slug(title) || slug(group[0]!.url)}`
    if (channelRows.some((c) => c.id === id)) continue
    unmatched++
    channelRows.push({
      id,
      name: title.slice(0, 256),
      alt_names: [],
      country: null,
      categories: [],
      languages: [],
      logo: null,
      website: null,
      origin: 'iptv-org',
      unmatched: true,
      retired: false,
      search_text: '',
    })
    const seen = new Set<string>()
    for (const s of group) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      sourceRows.push(sourceFrom(id, s, null))
    }
  }

  log(`upserting ${channelRows.length} channels, ${sourceRows.length} sources`)

  const stats = await db.transaction().execute(async (trx) => {
    await upsertLookups(trx, { countries, categories, languages })
    await upsertChannels(trx, channelRows)
    await upsertSources(trx, sourceRows)
    const retired = await retireMissingChannels(trx, channelRows.map((c) => c.id))
    const disabled = await disableMissingSources(trx, sourceRows)
    return { retired, disabled }
  })

  log('refreshing search text and counts')
  await refreshSearchText()
  await refreshChannelStats()

  return {
    channels: channelRows.length,
    sources: sourceRows.length,
    unmatched,
    retired: stats.retired,
    disabled: stats.disabled,
    skipped: skipped.n,
    lookups: countries.length + categories.length + languages.length,
  }
}

async function upsertLookups(
  trx: Trx,
  sets: {
    countries: z.infer<typeof upstreamLookup>[]
    categories: z.infer<typeof upstreamLookup>[]
    languages: z.infer<typeof upstreamLookup>[]
  },
) {
  const rows = [
    ...sets.countries.map((c) => ({
      kind: 'country' as const,
      code: (c.code ?? c.id ?? '').toUpperCase(),
      name: c.name,
      extra: c.flag ?? null,
    })),
    ...sets.categories.map((c) => ({
      kind: 'category' as const,
      code: c.id ?? c.code ?? '',
      name: c.name,
      extra: null,
    })),
    ...sets.languages.map((l) => ({
      kind: 'language' as const,
      code: l.code ?? l.id ?? '',
      name: l.name,
      extra: null,
    })),
  ].filter((r) => r.code)

  for (const batch of chunks(rows)) {
    await trx
      .insertInto('lookups')
      .values(batch)
      .onConflict((oc) =>
        oc.columns(['kind', 'code']).doUpdateSet((eb) => ({
          name: eb.ref('excluded.name'),
          extra: eb.ref('excluded.extra'),
        })),
      )
      .execute()
  }
}

async function upsertChannels(trx: Trx, rows: ChannelUpsert[]) {
  for (const batch of chunks(rows)) {
    await trx
      .insertInto('channels')
      .values(batch)
      .onConflict((oc) =>
        oc
          .column('id')
          .doUpdateSet((eb) => ({
            name: eb.ref('excluded.name'),
            alt_names: eb.ref('excluded.alt_names'),
            country: eb.ref('excluded.country'),
            categories: eb.ref('excluded.categories'),
            languages: eb.ref('excluded.languages'),
            logo: eb.ref('excluded.logo'),
            website: eb.ref('excluded.website'),
            unmatched: eb.ref('excluded.unmatched'),
            // Back in the lineup if upstream lists it again.
            retired: false,
          }))
          // An operator's edits outrank upstream, and rows they added are not
          // upstream's to rewrite.
          .where('channels.locked', '=', false)
          .where('channels.origin', '=', 'iptv-org'),
      )
      .execute()
  }
}

async function upsertSources(trx: Trx, rows: SourceUpsert[]) {
  for (const batch of chunks(rows)) {
    await trx
      .insertInto('sources')
      .values(batch)
      .onConflict((oc) =>
        oc
          .columns(['channel_id', 'url_key'])
          .doUpdateSet((eb) => ({
            quality: eb.ref('excluded.quality'),
            height: eb.ref('excluded.height'),
            feed: eb.ref('excluded.feed'),
            labels: eb.ref('excluded.labels'),
            user_agent: eb.ref('excluded.user_agent'),
            referrer: eb.ref('excluded.referrer'),
            insecure: eb.ref('excluded.insecure'),
            needs_headers: eb.ref('excluded.needs_headers'),
            is_dash: eb.ref('excluded.is_dash'),
            enabled: true,
          }))
          .where('sources.locked', '=', false)
          .where('sources.origin', '=', 'iptv-org'),
      )
      .execute()
  }
}

/**
 * Channels upstream dropped are retired, not deleted: favourites and history
 * on a client still point at the id, and upstream reinstates channels often
 * enough that throwing the row away loses an operator's edits with it.
 */
async function retireMissingChannels(trx: Trx, seen: readonly string[]) {
  await sql`create temporary table sync_channels (id text primary key) on commit drop`.execute(trx)
  for (const batch of chunks(seen, 5000)) {
    await sql`
      insert into sync_channels (id)
      select unnest(${sql.val(batch)}::text[])
      on conflict do nothing
    `.execute(trx)
  }

  const result = await sql<{ id: string }>`
    update channels c set retired = true
    where c.origin = 'iptv-org'
      and not c.locked
      and not c.retired
      and not exists (select 1 from sync_channels t where t.id = c.id)
    returning c.id
  `.execute(trx)
  return result.rows.length
}

/** Sources upstream dropped are disabled, for the same reason. */
async function disableMissingSources(trx: Trx, seen: readonly SourceUpsert[]) {
  // Keyed on the same digest the real table is: a URL long enough to overflow
  // a btree tuple would break the index here for exactly the same reason.
  await sql`
    create temporary table sync_sources (channel_id text, url_key text) on commit drop
  `.execute(trx)

  for (const batch of chunks(seen, 5000)) {
    await sql`
      insert into sync_sources (channel_id, url_key)
      select channel_id, md5(url)
      from unnest(${sql.val(batch.map((s) => s.channel_id))}::text[],
                  ${sql.val(batch.map((s) => s.url))}::text[]) as incoming(channel_id, url)
    `.execute(trx)
  }
  await sql`create index on sync_sources (channel_id, url_key)`.execute(trx)

  const result = await sql<{ id: number }>`
    update sources s set enabled = false
    where s.origin = 'iptv-org'
      and not s.locked
      and s.enabled
      and not exists (
        select 1 from sync_sources t
        where t.channel_id = s.channel_id and t.url_key = s.url_key
      )
    returning s.id
  `.execute(trx)
  return result.rows.length
}
