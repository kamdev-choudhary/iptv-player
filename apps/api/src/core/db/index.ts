import { Kysely, PostgresDialect, type LogEvent } from 'kysely'
import { Pool, types } from 'pg'
import { env, isProduction } from '../env.ts'
import type { Database } from './schema.ts'

/**
 * `int8` arrives as a string because it can exceed Number.MAX_SAFE_INTEGER.
 * Every bigint here is a COUNT over at most a few hundred thousand rows, so
 * reading them as numbers is safe and keeps the query layer honest.
 */
types.setTypeParser(types.builtins.INT8, (v) => Number(v))

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  // A probe sweep opens and drops connections in bursts; let idle ones go.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
  log: (event: LogEvent) => {
    if (event.level === 'error') {
      console.error('query failed', {
        sql: event.query.sql,
        durationMs: Math.round(event.queryDurationMillis),
        error: event.error,
      })
    } else if (!isProduction && event.queryDurationMillis > 200) {
      console.warn(`slow query ${Math.round(event.queryDurationMillis)}ms: ${event.query.sql}`)
    }
  },
})

export async function closeDb() {
  await db.destroy()
}

export type { Database } from './schema.ts'
