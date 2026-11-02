import { sql, type Expression, type SqlBool } from 'kysely'
import type {
  ApiChannel,
  ApiSource,
  ChannelDetail,
  ChannelQuery,
  Facet,
  Facets,
  HealthReason,
  Page,
  SortKey,
} from '@tuner/shared'
import { db } from '../db/index.ts'
import type { SourceHealthRow, SourceRow } from '../db/schema.ts'
import { playModeFor } from '../lib/classify.ts'
import { decodeCursor, encodeCursor } from '../lib/cursor.ts'
import { DEAD_AFTER_FAILURES } from './stats.ts'

/** `%` and `_` in a user's query are literal characters, not wildcards. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

const nullIfZero = (n: number) => (n > 0 ? n : null)

export const proxyPathFor = (sourceId: number) => `/stream/${sourceId}/index.m3u8`

type ChannelSelection = {
  id: string
  name: string
  alt_names: string[]
  country: string | null
  categories: string[]
  languages: string[]
  logo: string | null
  website: string | null
  origin: ApiChannel['origin']
  source_count: number
  live_count: number
  playable_count: number
  best_height: number
}

function toApiChannel(row: ChannelSelection): ApiChannel {
  return {
    id: row.id,
    name: row.name,
    altNames: row.alt_names,
    country: row.country,
    categories: row.categories,
    languages: row.languages,
    logo: row.logo,
    website: row.website,
    origin: row.origin,
    sourceCount: row.source_count,
    liveCount: row.live_count,
    playableCount: row.playable_count,
    bestHeight: nullIfZero(row.best_height),
  }
}

const CHANNEL_COLUMNS = [
  'id',
  'name',
  'alt_names',
  'country',
  'categories',
  'languages',
  'logo',
  'website',
  'origin',
  'source_count',
  'live_count',
  'playable_count',
  'best_height',
] as const

/** The lineup never shows hidden or retired channels, whatever else is asked. */
function visibleChannels() {
  return db
    .selectFrom('channels')
    .select(CHANNEL_COLUMNS)
    .where('hidden', '=', false)
    .where('retired', '=', false)
}

/** Which column each sort order keys on. All three are non-null integers. */
const SORT_COLUMN: Record<Exclude<SortKey, 'name'>, 'best_height' | 'source_count' | 'live_count'> = {
  quality: 'best_height',
  sources: 'source_count',
  live: 'live_count',
}

export async function listChannels(query: ChannelQuery): Promise<Page<ApiChannel>> {
  const tokens = (query.q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const phrase = tokens.join(' ')

  let base = visibleChannels()

  if (query.country) base = base.where('country', '=', query.country)
  if (query.language) {
    base = base.where(sql<SqlBool>`${sql.ref('languages')} @> array[${sql.val(query.language)}]::text[]`)
  }
  if (query.category?.length) {
    base = base.where(sql<SqlBool>`${sql.ref('categories')} && ${sql.val(query.category)}::text[]`)
  }
  if (query.minHeight) base = base.where('best_height', '>=', query.minHeight)
  if (query.liveOnly) base = base.where('live_count', '>', 0)
  if (query.playableOnly) base = base.where('playable_count', '>', 0)
  if (query.matchedOnly) base = base.where('unmatched', '=', false)

  // Every token must appear somewhere in the folded haystack. `search_text` is
  // stored lowercase, so `like` suffices and the trigram index applies.
  for (const token of tokens) {
    base = base.where(sql<SqlBool>`${sql.ref('search_text')} like ${`%${escapeLike(token)}%`}`)
  }

  const cursor = decodeCursor(query.cursor)

  // Counting the whole match set on every page is wasteful, so the total is
  // only computed for the first page and echoed back by the client after that.
  const totalPromise = cursor
    ? Promise.resolve<number | null>(null)
    : base
        .clearSelect()
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst()
        .then((r) => Number(r?.n ?? 0))

  const searching = tokens.length > 0

  /**
   * Relevance as three ordered buckets rather than a float. A `similarity()`
   * score would rank marginally better but cannot be paged through: buckets
   * are integers, so they fit the cursor like any other sort key.
   */
  const rank: Expression<number> = searching
    ? sql<number>`
        case
          when lower(${sql.ref('name')}) like ${`${escapeLike(phrase)}%`} then 0
          when lower(${sql.ref('name')}) like ${`%${escapeLike(phrase)}%`} then 1
          else 2
        end
      `
    : sql<number>`0`

  const sortColumn = query.sort === 'name' ? null : SORT_COLUMN[query.sort]
  // Relevance wins over the requested sort while a query is active; otherwise
  // the best match for "bbc" could sit a thousand rows down a name sort.
  const key: Expression<number> = searching ? rank : sortColumn ? sql.ref(sortColumn) : sql<number>`0`
  const descending = !searching && sortColumn !== null

  let rows = base.select([rank.as('rank')])

  if (cursor) {
    const cmp = descending ? sql`<` : sql`>`
    rows = rows.where(
      sql<SqlBool>`(${key} ${cmp} ${sql.val(cursor.v)})
        or (${key} = ${sql.val(cursor.v)}
          and (${sql.ref('name')}, ${sql.ref('id')}) > (${sql.val(cursor.n)}, ${sql.val(cursor.i)}))`,
    )
  }

  const ordered = rows
    .orderBy(descending ? sql`${key} desc` : sql`${key} asc`)
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .limit(query.limit + 1)

  const [found, total] = await Promise.all([ordered.execute(), totalPromise])

  const hasMore = found.length > query.limit
  const window = hasMore ? found.slice(0, query.limit) : found
  const last = window.at(-1)

  return {
    items: window.map(toApiChannel),
    nextCursor:
      hasMore && last ? encodeCursor({ v: Number(last.rank), n: last.name, i: last.id }) : null,
    total: total ?? window.length,
  }
}

/** Favourites and history: the client holds ids and wants the rows behind them. */
export async function channelsByIds(ids: readonly string[]): Promise<ApiChannel[]> {
  if (!ids.length) return []
  const rows = await visibleChannels()
    .where('id', 'in', [...ids])
    .execute()
  const byId = new Map(rows.map((r) => [r.id, toApiChannel(r)]))
  // Returned in the order asked for, because that order is the client's.
  return ids.map((id) => byId.get(id)).filter((c): c is ApiChannel => Boolean(c))
}

type SourceWithHealth = SourceRow & {
  [K in keyof SourceHealthRow as `h_${K}`]: SourceHealthRow[K] | null
}

export function toApiSource(row: SourceWithHealth): ApiSource {
  const health = row.h_checked_at
    ? {
        ok: Boolean(row.h_ok),
        checkedAt: new Date(row.h_checked_at).toISOString(),
        reason: (row.h_reason ?? 'network') as HealthReason,
        status: row.h_status ?? null,
        latencyMs: row.h_latency_ms ?? null,
        height: nullIfZero(row.h_height ?? 0),
        cors: row.h_cors ?? null,
        failures: row.h_failures ?? 0,
      }
    : null

  // A browser may only fetch this itself if nothing structural stops it and
  // the origin has been seen to allow cross-origin reads. Unknown counts as
  // allowed: the client tries direct, and falls back to the proxy if it fails.
  const corsKnownBad = health?.cors === false
  const flags = {
    insecure: row.insecure,
    needsHeaders: row.needs_headers,
    isDash: row.is_dash,
  }

  return {
    id: row.id,
    url: row.url,
    quality: row.quality,
    height: nullIfZero(health?.height ?? row.height ?? 0),
    feed: row.feed,
    labels: row.labels,
    play: playModeFor(flags, corsKnownBad),
    insecure: row.insecure,
    needsHeaders: row.needs_headers,
    dash: row.is_dash,
    proxyPath: proxyPathFor(row.id),
    health,
  }
}

function sourcesQuery() {
  return db
    .selectFrom('sources as s')
    .leftJoin('source_health as h', 'h.source_id', 's.id')
    .select([
      's.id',
      's.channel_id',
      's.url',
      's.quality',
      's.height',
      's.feed',
      's.labels',
      's.user_agent',
      's.referrer',
      's.insecure',
      's.needs_headers',
      's.is_dash',
      's.origin',
      's.enabled',
      's.locked',
      's.created_at',
      's.updated_at',
      'h.checked_at as h_checked_at',
      'h.ok as h_ok',
      'h.reason as h_reason',
      'h.status as h_status',
      'h.latency_ms as h_latency_ms',
      'h.height as h_height',
      'h.cors as h_cors',
      'h.failures as h_failures',
      'h.source_id as h_source_id',
    ])
}

/**
 * Best source first, and "best" is mostly "known to work": a confirmed-live
 * source outranks an untried one, which outranks one that has been failing.
 * Resolution only breaks ties among sources of equal standing.
 */
const SOURCE_ORDER = sql`
  case
    when h.ok is true then 0
    when h.source_id is null then 1
    when h.failures < ${DEAD_AFTER_FAILURES} then 2
    else 3
  end asc,
  s.is_dash asc,
  greatest(coalesce(h.height, 0), coalesce(s.height, 0)) desc,
  coalesce(h.latency_ms, 99999) asc,
  s.id asc
`

export async function channelDetail(id: string): Promise<ChannelDetail | null> {
  const channel = await visibleChannels().where('id', '=', id).executeTakeFirst()
  if (!channel) return null

  const rows = await sourcesQuery()
    .where('s.channel_id', '=', id)
    .where('s.enabled', '=', true)
    .orderBy(SOURCE_ORDER)
    .execute()

  return { ...toApiChannel(channel), sources: rows.map((r) => toApiSource(r as SourceWithHealth)) }
}

/** Every source for a channel, enabled or not. The admin view wants both. */
export async function adminSources(channelId: string): Promise<ApiSource[]> {
  const rows = await sourcesQuery().where('s.channel_id', '=', channelId).orderBy(SOURCE_ORDER).execute()
  return rows.map((r) => toApiSource(r as SourceWithHealth))
}

export async function sourceForProxy(id: number) {
  return db
    .selectFrom('sources as s')
    .innerJoin('channels as c', 'c.id', 's.channel_id')
    .select(['s.id', 's.url', 's.user_agent', 's.referrer', 's.is_dash', 's.enabled', 'c.hidden'])
    .where('s.id', '=', id)
    .executeTakeFirst()
}

async function facetsFor(kind: 'country' | 'category' | 'language'): Promise<Facet[]> {
  // Countries are scalar, the other two are arrays; unnest makes them uniform.
  const counts =
    kind === 'country'
      ? sql<{ code: string; n: number }>`
          select country as code, count(*)::int as n
          from channels
          where not hidden and not retired and country is not null
          group by country
        `
      : sql<{ code: string; n: number }>`
          select code, count(*)::int as n
          from channels, unnest(${sql.raw(kind === 'category' ? 'categories' : 'languages')}) as code
          where not hidden and not retired
          group by code
        `

  const [{ rows }, lookups] = await Promise.all([
    counts.execute(db),
    db.selectFrom('lookups').select(['code', 'name', 'extra']).where('kind', '=', kind).execute(),
  ])

  const names = new Map(lookups.map((l) => [l.code, l]))
  return rows
    .map((r) => ({
      code: r.code,
      name: names.get(r.code)?.name ?? r.code,
      extra: names.get(r.code)?.extra ?? null,
      count: r.n,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

export async function facets(): Promise<Facets> {
  const [countries, categories, languages, totals, lastCheck] = await Promise.all([
    facetsFor('country'),
    facetsFor('category'),
    facetsFor('language'),
    sql<{
      channels: number
      sources: number
      live: number
      updated: Date | null
    }>`
      select
        (select count(*)::int from channels where not hidden and not retired) as channels,
        (select count(*)::int from sources where enabled) as sources,
        (select count(*)::int from sources s
          join source_health h on h.source_id = s.id
          where s.enabled and h.ok) as live,
        (select max(updated_at) from channels) as updated
    `.execute(db),
    db
      .selectFrom('source_health')
      .select((eb) => eb.fn.max('checked_at').as('at'))
      .executeTakeFirst(),
  ])

  const t = totals.rows[0]
  return {
    countries,
    categories,
    languages,
    channelCount: t?.channels ?? 0,
    sourceCount: t?.sources ?? 0,
    liveSourceCount: t?.live ?? 0,
    updatedAt: t?.updated ? new Date(t.updated).toISOString() : null,
    lastHealthCheckAt: lastCheck?.at ? new Date(lastCheck.at as unknown as string).toISOString() : null,
  }
}
