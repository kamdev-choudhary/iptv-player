import { closeDb } from './db/index.ts'
import { migrateToLatest } from './db/migrate.ts'
import { env } from './env.ts'
import { startScheduler } from './scheduler.ts'
import { buildServer } from './server.ts'

const app = await buildServer()

if (env.MIGRATE_ON_BOOT) {
  app.log.info('applying migrations')
  await migrateToLatest((m) => app.log.info(m.trim()))
}

const stopScheduler = startScheduler(app.log)

await app.listen({ host: env.HOST, port: env.PORT })

/**
 * In-flight segments are real viewers, so the server stops accepting and then
 * waits for them rather than cutting them off. Docker's default grace period
 * is ten seconds, which is the ceiling on how long that wait is worth.
 */
let closing = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return
    closing = true
    app.log.info(`${signal} received, draining`)

    const deadline = setTimeout(() => {
      app.log.warn('drain timed out, exiting anyway')
      process.exit(1)
    }, 9_000)
    deadline.unref()

    void (async () => {
      try {
        stopScheduler()
        await app.close()
        await closeDb()
        app.log.info('closed cleanly')
        process.exit(0)
      } catch (err) {
        app.log.error({ err }, 'failed to close cleanly')
        process.exit(1)
      }
    })()
  })
}
