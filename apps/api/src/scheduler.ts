import { Cron } from 'croner'
import type { FastifyBaseLogger } from 'fastify'
import { healthRunOptions } from '@tuner/shared'
import { env } from './env.ts'
import { runHealthSweep } from './services/health.ts'
import { JobBusyError, runJob } from './services/jobs.ts'
import { runSync } from './services/sync.ts'

/**
 * The two jobs that keep the catalog true: a nightly pull from upstream, and a
 * probe sweep every few hours. The sweep is the one that earns its keep —
 * knowing which half of a public list is dead right now is the difference
 * between a lineup and a list of guesses.
 */
export function startScheduler(log: FastifyBaseLogger) {
  if (!env.RUN_JOBS) {
    log.info('scheduler disabled (RUN_JOBS=false)')
    return () => {}
  }

  const guard = (name: 'sync' | 'health', body: Parameters<typeof runJob>[1]) => async () => {
    try {
      const run = await runJob(name, body)
      log.info({ job: name, stats: run.stats }, `${name} finished`)
    } catch (err) {
      // Another process holding the lock is the system working, not an error.
      if (err instanceof JobBusyError) log.info(`${name} already running elsewhere, skipped`)
      else log.error({ err }, `${name} failed`)
    }
  }

  const sweep = healthRunOptions.parse({})

  const jobs = [
    new Cron(env.SYNC_CRON, { name: 'sync', protect: true }, guard('sync', (l) => runSync(l))),
    new Cron(env.HEALTH_CRON, { name: 'health', protect: true }, guard('health', (l) =>
      runHealthSweep(sweep, l),
    )),
  ]

  for (const job of jobs) {
    log.info({ job: job.name, next: job.nextRun()?.toISOString() }, 'scheduled')
  }

  return () => {
    for (const job of jobs) job.stop()
  }
}
