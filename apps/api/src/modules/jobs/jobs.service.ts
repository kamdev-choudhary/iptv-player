import { sql } from 'kysely'
import type { JobName, JobRun } from '@tuner/shared'
import { db } from '../../core/db/index.ts'
import { ConflictError } from '../../core/errors.ts'
import type { JobRunRow } from '../../core/db/schema.ts'

/**
 * Bookkeeping around the two long jobs, so an operator can see what ran, when,
 * and what it did — and so two of them never run at once.
 *
 * Mutual exclusion uses a Postgres advisory lock rather than a row flag. A
 * flag survives a crash and leaves the job wedged until someone clears it by
 * hand; an advisory lock is released by the database the moment the connection
 * holding it goes away.
 */

export class JobBusyError extends ConflictError {
  constructor(public job: JobName) {
    super(`${job} is already running`)
    this.name = 'JobBusyError'
  }
}

/** Stable per-job lock key. Two keys keep sync and health independent. */
const LOCK_KEYS: Record<JobName, number> = { sync: 821_001, health: 821_002 }

export function toJobRun(row: JobRunRow): JobRun {
  return {
    id: row.id,
    job: row.job as JobName,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    stats: (row.stats as Record<string, number> | null) ?? null,
    error: row.error,
  }
}

export type JobBody = (log: (message: string) => void) => Promise<Record<string, number>>

/**
 * Runs `body` under the job's lock, recording a row for the attempt either
 * way. Throws `JobBusyError` if the lock is already held.
 */
export async function runJob(job: JobName, body: JobBody): Promise<JobRun> {
  return db.connection().execute(async (conn) => {
    const locked = await sql<{ ok: boolean }>`
      select pg_try_advisory_lock(${LOCK_KEYS[job]}) as ok
    `.execute(conn)

    if (!locked.rows[0]?.ok) throw new JobBusyError(job)

    const run = await conn
      .insertInto('job_runs')
      .values({ job, status: 'running' })
      .returningAll()
      .executeTakeFirstOrThrow()

    const lines: string[] = []
    const log = (message: string) => {
      lines.push(message)
      console.log(`[${job}] ${message}`)
    }

    try {
      const stats = await body(log)
      const finished = await conn
        .updateTable('job_runs')
        .set({
          status: 'ok',
          finished_at: new Date().toISOString(),
          stats: sql`${JSON.stringify(stats)}::jsonb`,
        })
        .where('id', '=', run.id)
        .returningAll()
        .executeTakeFirstOrThrow()
      return toJobRun(finished)
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
      await conn
        .updateTable('job_runs')
        .set({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: message.slice(0, 8000),
        })
        .where('id', '=', run.id)
        .execute()
      throw err
    } finally {
      await sql`select pg_advisory_unlock(${LOCK_KEYS[job]})`.execute(conn)
    }
  })
}

export async function recentJobRuns(limit = 20): Promise<JobRun[]> {
  const rows = await db
    .selectFrom('job_runs')
    .selectAll()
    .orderBy('started_at', 'desc')
    .limit(limit)
    .execute()
  return rows.map(toJobRun)
}
