import type { ColumnType, Generated, JSONColumnType, Selectable } from 'kysely'
import type { HealthReason, Origin } from '@tuner/shared'

/** Written by the database, never by us. */
type Timestamp = ColumnType<Date, string | undefined, string | undefined>

export interface ChannelTable {
  id: string
  name: string
  alt_names: string[]
  country: string | null
  categories: string[]
  languages: string[]
  logo: string | null
  website: string | null
  origin: Origin
  /** Hidden by an operator; stays in the database, leaves the lineup. */
  hidden: Generated<boolean>
  /** Upstream closed, replaced or flagged it. Excluded from the lineup. */
  retired: Generated<boolean>
  /** Upstream has no broadcaster behind this row — a stream matched by title. */
  unmatched: Generated<boolean>
  /**
   * Folded name, alternative names, country and category names. Carries the
   * trigram index, so search never has to touch the other columns.
   */
  search_text: string
  /**
   * Recomputed by `refreshChannelStats` after sync, after a probe sweep and
   * after an admin write. The lineup pages on these, so they have to be
   * columns rather than aggregates evaluated per request.
   */
  source_count: Generated<number>
  /** Sources whose last probe passed. */
  live_count: Generated<number>
  /** Sources a browser can play, directly or through the proxy. */
  playable_count: Generated<number>
  /** Best known height; 0 means unknown. */
  best_height: Generated<number>
  /** An operator has edited this row; upstream sync leaves it alone. */
  locked: Generated<boolean>
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface SourceTable {
  id: Generated<number>
  channel_id: string
  url: string
  quality: string | null
  /** Height parsed from `quality`; the probed height lives in source_health. */
  height: number | null
  feed: string | null
  labels: string[]
  /** Sent upstream by the proxy. Browsers may not set either. */
  user_agent: string | null
  referrer: string | null
  /** Plain http, which an https page may not fetch. */
  insecure: Generated<boolean>
  /** Needs a User-Agent or Referer, so only the proxy can play it. */
  needs_headers: Generated<boolean>
  is_dash: Generated<boolean>
  origin: Origin
  enabled: Generated<boolean>
  locked: Generated<boolean>
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface SourceHealthTable {
  source_id: number
  checked_at: Timestamp
  ok: boolean
  reason: HealthReason
  status: number | null
  latency_ms: number | null
  /** Read out of the manifest, which beats the published label. */
  height: number | null
  /** Whether the origin sent a usable `Access-Control-Allow-Origin`. */
  cors: boolean | null
  failures: Generated<number>
}

/** Countries, categories and languages in one table; all three are code → name. */
export interface LookupTable {
  kind: 'country' | 'category' | 'language'
  code: string
  name: string
  /** Flag emoji for countries, null otherwise. */
  extra: string | null
}

export interface JobRunTable {
  id: Generated<number>
  job: string
  status: 'running' | 'ok' | 'failed'
  started_at: Generated<Timestamp>
  finished_at: Timestamp | null
  stats: JSONColumnType<Record<string, number> | null> | null
  error: string | null
}

export interface Database {
  channels: ChannelTable
  sources: SourceTable
  source_health: SourceHealthTable
  lookups: LookupTable
  job_runs: JobRunTable
}

export type ChannelRow = Selectable<ChannelTable>
export type SourceRow = Selectable<SourceTable>
export type SourceHealthRow = Selectable<SourceHealthTable>
export type LookupRow = Selectable<LookupTable>
export type JobRunRow = Selectable<JobRunTable>
