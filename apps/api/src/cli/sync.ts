import { closeDb } from '../db/index.ts'
import { migrateToLatest } from '../db/migrate.ts'
import { JobBusyError, runJob } from '../services/jobs.ts'
import { runSync } from '../services/sync.ts'

/** `pnpm sync` — a one-off pull, for the first load and for debugging. */
try {
  await migrateToLatest()
  const run = await runJob('sync', (log) => runSync(log))
  console.log(`\nsync ${run.status}`)
  for (const [key, value] of Object.entries(run.stats ?? {})) {
    console.log(`  ${key.padEnd(16)} ${value}`)
  }
} catch (err) {
  if (err instanceof JobBusyError) console.error('A sync is already running.')
  else console.error(err)
  await closeDb()
  process.exit(1)
}

await closeDb()
