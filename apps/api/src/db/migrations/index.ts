import type { Migration, MigrationProvider } from 'kysely'
import * as initial from './001-initial.ts'

/**
 * Migrations are listed rather than read off disk: the API ships as a bundle,
 * where Kysely's FileMigrationProvider has no directory to walk.
 */
const migrations: Record<string, Migration> = {
  '001-initial': initial,
}

export const migrationProvider: MigrationProvider = {
  getMigrations: async () => migrations,
}
