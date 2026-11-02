import { healthRunOptions } from '@tuner/shared'
import { closeDb } from '../db/index.ts'
import { JobBusyError, runJob } from '../services/jobs.ts'
import { runHealthSweep } from '../services/health.ts'

/**
 * `pnpm health --stale-hours 0 --limit 500` — probe sources now.
 *
 * The flags mirror the scheduled sweep's options, so a run from the terminal
 * and a run from cron do the same thing.
 */
function flag(name: string) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? undefined : process.argv[at + 1]
}

const opts = healthRunOptions.parse({
  staleHours: flag('stale-hours'),
  limit: flag('limit'),
  concurrency: flag('concurrency'),
})

try {
  const run = await runJob('health', (log) => runHealthSweep(opts, log))
  console.log(`\nhealth ${run.status}`)
  for (const [key, value] of Object.entries(run.stats ?? {})) {
    console.log(`  ${key.padEnd(12)} ${value}`)
  }
} catch (err) {
  if (err instanceof JobBusyError) console.error('A sweep is already running.')
  else console.error(err)
  await closeDb()
  process.exit(1)
}

await closeDb()
