import { sql } from 'kysely'
import type { M3uImport, XtreamImport } from '@tuner/shared'
import { db } from '../../core/db/index.ts'
import { UnprocessableError } from '../../core/errors.ts'
import { refreshChannelStats, refreshSearchText } from '../catalog/catalog.stats.ts'
import { sourceRow } from '../sources/sources.service.ts'
import { parseM3u } from './imports.m3u.ts'

/**
 * Bringing an outside playlist into the catalog.
 *
 * Each import gets a namespace, and every row it writes is prefixed with it —
 * so two providers can be imported side by side, and re-importing one can
 * remove what it has stopped publishing without touching the other.
 */

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
    if (!res.ok) throw new UnprocessableError(`The playlist URL responded ${res.status}`)
    text = await res.text()
  }

  const parsed = parseM3u(text)
  if (!parsed.length) throw new UnprocessableError('No playlist entries found')
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
