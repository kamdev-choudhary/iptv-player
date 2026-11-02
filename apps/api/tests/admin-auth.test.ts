import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

/**
 * The guard on every write, tested at the routing layer rather than by reading
 * the hook.
 *
 * This suite exists because of a real failure. `requireAdmin` was registered
 * without `fastify-plugin`, which gave it its own encapsulated context: the
 * hooks attached to a scope containing no routes, and every admin route was
 * served to anyone who asked. An unauthenticated PATCH returned 200 and
 * changed a row. Nothing in the code looked wrong, and no unit test could have
 * noticed, because the bug was entirely in how the pieces were assembled.
 *
 * So the routes are discovered from the built server rather than listed here.
 * A new admin module is covered the moment it is mounted, which is the only
 * way this test still means something in a year.
 */

const TOKEN = 'test-admin-token-at-least-16'

process.env.ADMIN_TOKEN = TOKEN

interface Route {
  method: string
  url: string
}

/**
 * Reads the route tree Fastify prints, which is the only public view of what
 * was actually mounted. Each line is one node; indentation is four characters
 * per level, and a node's path is its own segment appended to its parent's.
 */
function parseRoutes(tree: string): Route[] {
  const routes: Route[] = []
  const stack: string[] = []

  for (const line of tree.split('\n')) {
    const match = /^([│ ]*)(?:├──|└──) (.*?) \(([^)]+)\)\s*$/.exec(line)
    if (!match) continue

    const depth = match[1]!.length / 4
    stack.length = depth
    stack[depth] = match[2]!

    const url = stack.join('')
    for (const method of match[3]!.split(',')) routes.push({ method: method.trim(), url })
  }
  return routes
}

/** `/admin/channels/:id` is a shape, not an address; give it one. */
const concrete = (url: string) => url.replace(/:[^/]+/g, '1')

describe('with an admin token configured', () => {
  let app: FastifyInstance
  let adminRoutes: Route[]

  beforeAll(async () => {
    const { buildServer } = await import('../src/app.ts')
    app = await buildServer()
    await app.ready()
    adminRoutes = parseRoutes(app.printRoutes({ commonPrefix: false })).filter((r) =>
      r.url.startsWith('/admin'),
    )
  })

  afterAll(async () => {
    await app.close()
    const { closeDb } = await import('../src/core/db/index.ts')
    await closeDb()
  })

  it('found the admin routes to check', () => {
    // A parser that quietly matched nothing would make every assertion below
    // pass without testing anything.
    expect(adminRoutes.length).toBeGreaterThanOrEqual(10)
    expect(adminRoutes.map((r) => r.url)).toContain('/admin/sources/:id')
  })

  it('refuses every admin route without a token', async () => {
    const allowed: Route[] = []

    for (const route of adminRoutes) {
      const response = await app.inject({ method: route.method as 'GET', url: concrete(route.url) })
      if (response.statusCode !== 401) allowed.push({ ...route, method: route.method })
    }

    // Naming them is the difference between "something is open" and knowing
    // which one, which is what you want at three in the morning.
    expect(allowed.map((r) => `${r.method} ${r.url}`)).toEqual([])
  })

  it('refuses a wrong token', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/sources/1',
      headers: { authorization: 'Bearer not-the-admin-token-x' },
      payload: { url: 'https://example.com/a.m3u8' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('refuses a token that is a prefix of the real one', async () => {
    // The comparison is length-checked before `timingSafeEqual`, which throws
    // on buffers of different lengths.
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/sources/1',
      headers: { authorization: `Bearer ${TOKEN.slice(0, -1)}` },
      payload: { url: 'https://example.com/a.m3u8' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('lets the right token through to the route itself', async () => {
    // A bad id, so the request is rejected by the route's own schema rather
    // than reaching the database this suite does not have. Any answer but 401
    // proves the guard passed it on.
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/sources/not-a-number',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { url: 'https://example.com/a.m3u8' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('tells caches not to keep an operator view', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/jobs',
      headers: { authorization: 'Bearer wrong-token-but-long-enough' },
    })
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('leaves the read API open', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/facets' })
    // No database here, so this fails — but as a 500, not as a 401. The guard
    // reaching past /admin would be the regression worth catching.
    expect(response.statusCode).not.toBe(401)
  })
})
