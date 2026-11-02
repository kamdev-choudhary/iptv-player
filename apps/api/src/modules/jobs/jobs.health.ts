import { sql } from 'kysely'
import type { HealthReason, HealthRunOptions } from '@tuner/shared'
import { db } from '../../core/db/index.ts'
import { mapLimit } from '../../core/upstream.ts'
import { probeSource } from '../sources/sources.probe.ts'
import { refreshChannelStats } from '../catalog/catalog.stats.ts'

/**
 * Probes sources and records what happened.
 *
 * This is the half of the system a static build could never have. Roughly half
 * of any public list is dead at a given moment, and without asking there is no
 * way to tell which half — so the client was left to discover it one failed
 * playback at a time. Here the server finds out on a schedule, and the lineup
 * is ordered and filtered by what actually answered.
 */

export interface HealthStats extends Record<string, number> {
  probed: number
  live: number
  dead: number
  needsProxy: number
  durationMs: number
}

interface Candidate {
  id: number
  url: string
  user_agent: string | null
  referrer: string | null
}

/** Least recently checked first, so an interrupted sweep resumes where it stopped. */
async function candidates(opts: HealthRunOptions): Promise<Candidate[]> {
  const { rows } = await sql<Candidate>`
    select s.id, s.url, s.user_agent, s.referrer
    from sources s
    join channels c on c.id = s.channel_id
    left join source_health h on h.source_id = s.id
    where s.enabled
      and not c.hidden
      and not c.retired
      and not s.is_dash
      and (h.checked_at is null or h.checked_at < now() - make_interval(hours => ${opts.staleHours}))
    order by h.checked_at asc nulls first, s.id asc
    limit ${opts.limit}
  `.execute(db)
  return rows
}

interface Recorded {
  source_id: number
  ok: boolean
  reason: HealthReason
  status: number | null
  latency_ms: number | null
  height: number | null
  cors: boolean | null
}

async function record(rows: Recorded[]) {
  if (!rows.length) return
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    await db
      .insertInto('source_health')
      .values(
        batch.map((r) => ({ ...r, checked_at: new Date().toISOString(), failures: r.ok ? 0 : 1 })),
      )
      .onConflict((oc) =>
        oc.column('source_id').doUpdateSet((eb) => ({
          checked_at: eb.ref('excluded.checked_at'),
          ok: eb.ref('excluded.ok'),
          reason: eb.ref('excluded.reason'),
          status: eb.ref('excluded.status'),
          latency_ms: eb.ref('excluded.latency_ms'),
          height: eb.ref('excluded.height'),
          cors: eb.ref('excluded.cors'),
          // A run of failures is what distinguishes a flaky source from a dead
          // one, so the count accumulates rather than being overwritten.
          failures: sql`case when excluded.ok then 0 else source_health.failures + 1 end`,
        })),
      )
      .execute()
  }
}

export async function runHealthSweep(
  opts: HealthRunOptions,
  log: (m: string) => void = () => {},
  signal?: AbortSignal,
): Promise<HealthStats> {
  const started = Date.now()
  const queue = await candidates(opts)
  log(`probing ${queue.length} sources at concurrency ${opts.concurrency}`)

  let done = 0
  let live = 0
  let needsProxy = 0

  const results = await mapLimit(queue, opts.concurrency, async (source) => {
    if (signal?.aborted) return null
    const result = await probeSource({
      url: source.url,
      userAgent: source.user_agent,
      referrer: source.referrer,
      deep: true,
      signal,
    })

    if (result.ok) {
      live++
      if (result.cors === false) needsProxy++
    }

    done++
    if (done % 500 === 0) log(`  ${done}/${queue.length} probed, ${live} live`)

    return {
      source_id: source.id,
      ok: result.ok,
      reason: result.reason,
      status: result.status,
      latency_ms: result.latencyMs,
      height: result.height,
      cors: result.cors,
    } satisfies Recorded
  })

  const recorded = results.filter((r): r is Recorded => r !== null)
  await record(recorded)
  log('refreshing channel counts')
  await refreshChannelStats()

  return {
    probed: recorded.length,
    live,
    dead: recorded.length - live,
    needsProxy,
    durationMs: Date.now() - started,
  }
}
