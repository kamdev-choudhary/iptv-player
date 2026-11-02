import { timingSafeEqual } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { env } from './env.ts'

/**
 * The guard on every write.
 *
 * Registered once and applied by the admin scope, so a new admin module gets
 * the same protection by being mounted there rather than by remembering to
 * add a hook.
 */

function tokenMatches(given: string, expected: string) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const plugin: FastifyPluginAsync = async (app) => {
  /**
   * No token configured means no admin API. Defaulting to open would be the
   * kind of convenience that ends with someone else's playlist in the database.
   */
  app.addHook('onRequest', async (request, reply) => {
    if (!env.ADMIN_TOKEN) {
      return reply.code(503).send({ error: 'Admin API is disabled: ADMIN_TOKEN is not set' })
    }
    const given = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
    if (!given || !tokenMatches(given, env.ADMIN_TOKEN)) {
      return reply.code(401).send({ error: 'Bad or missing admin token' })
    }
  })

  // An operator's view is never worth storing anywhere.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store')
  })
}

/**
 * Deliberately not wrapped by fastify-plugin: these hooks must stay inside the
 * scope that registers them rather than leaking out to the read API.
 */
export const requireAdmin = plugin
