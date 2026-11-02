import { Migrator, type MigrationResultSet } from 'kysely'
import { closeDb, db } from './index.ts'
import { migrationProvider } from './migrations/index.ts'

function report(results: MigrationResultSet['results'], log: (m: string) => void) {
  for (const r of results ?? []) {
    log(
      r.status === 'Success'
        ? `  ${r.direction === 'Up' ? 'applied' : 'reverted'} ${r.migrationName}`
        : `  ${r.status} ${r.migrationName}`,
    )
  }
}

export function migrator() {
  return new Migrator({ db, provider: migrationProvider })
}

/** Applies every pending migration. Throws on the first failure. */
export async function migrateToLatest(log: (m: string) => void = console.log) {
  const { error, results } = await migrator().migrateToLatest()
  report(results, log)
  if (error) throw error instanceof Error ? error : new Error(String(error))
  if (!results?.length) log('  already up to date')
  return results ?? []
}

async function main() {
  const direction = process.argv[2] ?? 'up'
  if (direction === 'up') {
    console.log('Migrating up')
    await migrateToLatest()
  } else if (direction === 'down') {
    console.log('Migrating down one step')
    const { error, results } = await migrator().migrateDown()
    report(results, console.log)
    if (error) throw error instanceof Error ? error : new Error(String(error))
  } else {
    throw new Error(`Unknown direction "${direction}". Use up or down.`)
  }
}

// Only when invoked as a CLI; importing this module must not run anything.
if (process.argv[1]?.includes('migrate')) {
  main()
    .then(closeDb)
    .catch(async (err) => {
      console.error(err)
      await closeDb()
      process.exit(1)
    })
}
