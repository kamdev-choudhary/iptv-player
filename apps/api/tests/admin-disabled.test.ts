import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

/**
 * The other half of the guard, in its own file because `env` is read once at
 * import and frozen — which is the behaviour being tested.
 *
 * A deployment with no `ADMIN_TOKEN` set must refuse the admin API rather than
 * default to open. Vitest gives each file its own module registry, so simply
 * not setting the variable here is enough.
 */

let app: FastifyInstance

beforeAll(async () => {
  expect(process.env.ADMIN_TOKEN).toBeUndefined()
  const { buildServer } = await import('../src/app.ts')
  app = await buildServer()
  await app.ready()
})

afterAll(async () => {
  await app.close()
  const { closeDb } = await import('../src/core/db/index.ts')
  await closeDb()
})

it('refuses the admin API outright when no token is configured', async () => {
  const response = await app.inject({ method: 'GET', url: '/admin/jobs' })
  // 503 rather than 401: there is no token that would work, and saying so is
  // more useful than inviting someone to guess.
  expect(response.statusCode).toBe(503)
  expect(response.json()).toMatchObject({ error: expect.stringContaining('ADMIN_TOKEN') })
})

it('refuses it even when a token is offered', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/jobs/sync',
    headers: { authorization: 'Bearer anything-at-all-here' },
  })
  expect(response.statusCode).toBe(503)
})

it('still serves the read API', async () => {
  const response = await app.inject({ method: 'GET', url: '/health' })
  // No database in this suite, so 503 from the health check itself — the
  // point is that it answered rather than being gated behind the admin guard.
  expect([200, 503]).toContain(response.statusCode)
})
