import { sql } from 'kysely'
import type {
  ChannelInput,
  ChannelPatch,
  M3uImport,
  SourceInput,
  SourcePatch,
  XtreamImport,
} from '@tuner/shared'
import { db } from '../db/index.ts'
import { flagsFor, heightOf } from '../lib/classify.ts'
import { parseM3u } from '../lib/m3u.ts'
import { refreshChannelStats, refreshSearchText } from './stats.ts'

/**
 * The write layer. Every function here marks what it touches as `locked`,
 * which is what makes a correction permanent: the nightly sync only rewrites
 * unlocked rows it owns, so an address fixed here stays fixed.
 */

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}

/** Shared between manual writes and imports: URL in, storable row out. */
function sourceRow(channelId: string, input: SourceInput, origin: 'manual' | 'm3u') {
  const flags = flagsFor(input.url, input.userAgent, input.referrer)
  return {
    channel_id: channelId,
    url: input.url,
    quality: input.quality ?? null,
    height: heightOf(input.quality),
    feed: input.feed ?? null,
    labels: input.labels ?? [],
    user_agent: input.userAgent ?? null,
    referrer: input.referrer ?? null,
    insecure: flags.insecure,
    needs_headers: flags.needsHeaders,
    is_dash: flags.isDash,
    origin,
    enabled: input.enabled ?? true,
    locked: true,
  }
}

/** Columns an upsert refreshes from the incoming row. */
const SOURCE_REFRESH = [
  'quality',
  'height',
  'feed',
  'labels',
  'user_agent',
  'referrer',
  'insecure',
  'needs_headers',
  'is_dash',
] as const

export async function upsertChannel(input: ChannelInput) {
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('channels')
      .values({
        id: input.id,
        name: input.name,
        alt_names: input.altNames ?? [],
        country: input.country ?? null,
        categories: input.categories ?? [],
        languages: input.languages ?? [],
        logo: input.logo ?? null,
        website: input.website ?? null,
        origin: 'manual',
        hidden: input.hidden ?? false,
        retired: false,
        unmatched: false,
        search_text: '',
        locked: true,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet((eb) => ({
          name: eb.ref('excluded.name'),
          alt_names: eb.ref('excluded.alt_names'),
          country: eb.ref('excluded.country'),
          categories: eb.ref('excluded.categories'),
          languages: eb.ref('excluded.languages'),
          logo: eb.ref('excluded.logo'),
          website: eb.ref('excluded.website'),
          hidden: eb.ref('excluded.hidden'),
          retired: false,
          locked: true,
        })),
      )
      .execute()

    if (input.sources?.length) {
      await trx
        .insertInto('sources')
        .values(input.sources.map((s) => sourceRow(input.id, s, 'manual')))
        .onConflict((oc) =>
          oc.columns(['channel_id', 'url_key']).doUpdateSet((eb) => ({
            ...Object.fromEntries(SOURCE_REFRESH.map((c) => [c, eb.ref(`excluded.${c}`)])),
            enabled: eb.ref('excluded.enabled'),
            locked: true,
          })),
        )
        .execute()
    }
  })

  await refreshSearchText([input.id])
  await refreshChannelStats([input.id])
}

export async function patchChannel(id: string, patch: ChannelPatch) {
  const set: Record<string, unknown> = { locked: true }
  if (patch.name !== undefined) set.name = patch.name
  if (patch.altNames !== undefined) set.alt_names = patch.altNames
  if (patch.country !== undefined) set.country = patch.country
  if (patch.categories !== undefined) set.categories = patch.categories
  if (patch.languages !== undefined) set.languages = patch.languages
  if (patch.logo !== undefined) set.logo = patch.logo
  if (patch.website !== undefined) set.website = patch.website
  if (patch.hidden !== undefined) set.hidden = patch.hidden

  const updated = await db
    .updateTable('channels')
    .set(set)
    .where('id', '=', id)
    .returning('id')
    .executeTakeFirst()

  if (!updated) throw new NotFoundError(`channel ${id}`)
  await refreshSearchText([id])
  await refreshChannelStats([id])
}

export async function deleteChannel(id: string) {
  const deleted = await db
    .deleteFrom('channels')
    .where('id', '=', id)
    .returning('id')
    .executeTakeFirst()
  if (!deleted) throw new NotFoundError(`channel ${id}`)
}

export async function addSource(channelId: string, input: SourceInput) {
  const channel = await db
    .selectFrom('channels')
    .select('id')
    .where('id', '=', channelId)
    .executeTakeFirst()
  if (!channel) throw new NotFoundError(`channel ${channelId}`)

  const row = await db
    .insertInto('sources')
    .values(sourceRow(channelId, input, 'manual'))
    .onConflict((oc) =>
      oc.columns(['channel_id', 'url_key']).doUpdateSet((eb) => ({
        ...Object.fromEntries(SOURCE_REFRESH.map((c) => [c, eb.ref(`excluded.${c}`)])),
        enabled: true,
        locked: true,
      })),
    )
    .returning('id')
    .executeTakeFirstOrThrow()

  await refreshChannelStats([channelId])
  return row.id
}

/**
 * The endpoint this whole rebuild exists for: a stream address changes, it is
 * patched here, and the next request serves the new one. No build, no deploy.
 */
export async function patchSource(id: number, patch: SourcePatch) {
  const existing = await db
    .selectFrom('sources')
    .select(['id', 'channel_id', 'url', 'user_agent', 'referrer'])
    .where('id', '=', id)
    .executeTakeFirst()
  if (!existing) throw new NotFoundError(`source ${id}`)

  const url = patch.url ?? existing.url
  const userAgent = patch.userAgent !== undefined ? patch.userAgent : existing.user_agent
  const referrer = patch.referrer !== undefined ? patch.referrer : existing.referrer
  const flags = flagsFor(url, userAgent, referrer)

  const set: Record<string, unknown> = {
    url,
    user_agent: userAgent ?? null,
    referrer: referrer ?? null,
    insecure: flags.insecure,
    needs_headers: flags.needsHeaders,
    is_dash: flags.isDash,
    locked: true,
  }
  if (patch.quality !== undefined) {
    set.quality = patch.quality ?? null
    set.height = heightOf(patch.quality)
  }
  if (patch.feed !== undefined) set.feed = patch.feed ?? null
  if (patch.labels !== undefined) set.labels = patch.labels
  if (patch.enabled !== undefined) set.enabled = patch.enabled

  await db.transaction().execute(async (trx) => {
    await trx.updateTable('sources').set(set).where('id', '=', id).execute()
    // The address changed, so what was known about the old one no longer applies.
    if (patch.url && patch.url !== existing.url) {
      await trx.deleteFrom('source_health').where('source_id', '=', id).execute()
    }
  })

  await refreshChannelStats([existing.channel_id])
  return existing.channel_id
}

/**
 * Disabled and locked rather than deleted, when the row came from upstream:
 * a hard delete would simply be reinserted by tonight's sync.
 */
export async function deleteSource(id: number) {
  const row = await db
    .selectFrom('sources')
    .select(['id', 'channel_id', 'origin'])
    .where('id', '=', id)
    .executeTakeFirst()
  if (!row) throw new NotFoundError(`source ${id}`)

  if (row.origin === 'iptv-org') {
    await db
      .updateTable('sources')
      .set({ enabled: false, locked: true })
      .where('id', '=', id)
      .execute()
  } else {
    await db.deleteFrom('sources').where('id', '=', id).execute()
  }

  await refreshChannelStats([row.channel_id])
  return row.channel_id
}

export interface ImportStats extends Record<string, number> {
  channels: number
  sources: number
  removedChannels: number
  removedSources: number
}

async function importParsed(
  namespace: string,
  parsed: ReturnType<typeof parseM3u>,
  replace: boolean,
): Promise<ImportStats> {
  const prefix = `m3u:${namespace}:`

  const channelRows = parsed.map((c) => ({
    id: `${prefix}${c.key}`,
    name: c.name.slice(0, 256),
    alt_names: [] as string[],
    country: c.country,
    categories: c.categories.slice(0, 16),
    languages: c.language ? [c.language] : [],
    logo: c.logo,
    website: null,
    origin: 'm3u' as const,
    hidden: false,
    retired: false,
    unmatched: false,
    search_text: '',
    locked: true,
  }))

  const sourceRows = parsed.flatMap((c) =>
    c.sources.map((s) =>
      sourceRow(
        `${prefix}${c.key}`,
        { url: s.url, userAgent: s.userAgent, referrer: s.referrer },
        'm3u',
      ),
    ),
  )

  const removed = await db.transaction().execute(async (trx) => {
    // The incoming playlist, as a table the delete statements can join on.
    // Doing it this way keeps "remove what is no longer published" to one
    // statement each, rather than a predicate built from thousands of values.
    await sql`
      create temporary table import_rows (channel_id text, url_key text) on commit drop
    `.execute(trx)

    for (let i = 0; i < sourceRows.length; i += 5000) {
      const batch = sourceRows.slice(i, i + 5000)
      await sql`
        insert into import_rows (channel_id, url_key)
        select channel_id, md5(url)
        from unnest(${sql.val(batch.map((s) => s.channel_id))}::text[],
                    ${sql.val(batch.map((s) => s.url))}::text[]) as incoming(channel_id, url)
      `.execute(trx)
    }
    await sql`create index on import_rows (channel_id, url_key)`.execute(trx)

    for (let i = 0; i < channelRows.length; i += 500) {
      await trx
        .insertInto('channels')
        .values(channelRows.slice(i, i + 500))
        .onConflict((oc) =>
          oc.column('id').doUpdateSet((eb) => ({
            name: eb.ref('excluded.name'),
            country: eb.ref('excluded.country'),
            categories: eb.ref('excluded.categories'),
            languages: eb.ref('excluded.languages'),
            logo: eb.ref('excluded.logo'),
            retired: false,
          })),
        )
        .execute()
    }

    for (let i = 0; i < sourceRows.length; i += 500) {
      await trx
        .insertInto('sources')
        .values(sourceRows.slice(i, i + 500))
        .onConflict((oc) =>
          oc.columns(['channel_id', 'url_key']).doUpdateSet((eb) => ({
            user_agent: eb.ref('excluded.user_agent'),
            referrer: eb.ref('excluded.referrer'),
            insecure: eb.ref('excluded.insecure'),
            needs_headers: eb.ref('excluded.needs_headers'),
            is_dash: eb.ref('excluded.is_dash'),
            enabled: true,
          })),
        )
        .execute()
    }

    if (!replace) return { removedChannels: 0, removedSources: 0 }

    // Addresses the provider has stopped publishing, then channels left with
    // nothing. Scoped to this namespace, so one import cannot touch another.
    const goneSources = await sql<{ id: number }>`
      delete from sources s
      where s.channel_id like ${`${prefix}%`}
        and not exists (
          select 1 from import_rows r
          where r.channel_id = s.channel_id and r.url_key = s.url_key
        )
      returning s.id
    `.execute(trx)

    const goneChannels = await sql<{ id: string }>`
      delete from channels c
      where c.id like ${`${prefix}%`}
        and not exists (select 1 from import_rows r where r.channel_id = c.id)
      returning c.id
    `.execute(trx)

    return { removedChannels: goneChannels.rows.length, removedSources: goneSources.rows.length }
  })

  const ids = channelRows.map((c) => c.id)
  await refreshSearchText(ids)
  await refreshChannelStats(ids)

  return { channels: channelRows.length, sources: sourceRows.length, ...removed }
}

export async function importM3u(input: M3uImport): Promise<ImportStats> {
  let text = input.body ?? ''
  if (input.url) {
    const res = await fetch(input.url, {
      signal: AbortSignal.timeout(120_000),
      headers: { 'user-agent': 'tuner-import' },
    })
    if (!res.ok) throw new Error(`playlist responded ${res.status}`)
    text = await res.text()
  }

  const parsed = parseM3u(text)
  if (!parsed.length) throw new Error('No playlist entries found')
  return importParsed(input.namespace, parsed, input.replace)
}

/** Xtream portals publish the same lineup as an M3U, so this normalises to one. */
export async function importXtream(input: XtreamImport): Promise<ImportStats> {
  const host = input.host.replace(/\/+$/, '')
  const base = /^https?:\/\//i.test(host) ? host : `http://${host}`
  const url =
    `${base}/get.php?username=${encodeURIComponent(input.username)}` +
    `&password=${encodeURIComponent(input.password)}&type=m3u_plus&output=ts`

  return importM3u({ url, namespace: input.namespace, replace: input.replace })
}

export async function setChannelHidden(id: string, hidden: boolean) {
  const updated = await db
    .updateTable('channels')
    .set({ hidden, locked: true })
    .where('id', '=', id)
    .returning('id')
    .executeTakeFirst()
  if (!updated) throw new NotFoundError(`channel ${id}`)
}
