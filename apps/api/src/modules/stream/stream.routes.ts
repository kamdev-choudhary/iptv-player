import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyError } from 'fastify'
import { z } from 'zod'
import { env } from '../../core/env.ts'
import { statusOf } from '../../core/errors.ts'
import * as controller from './stream.controller.ts'

const params = z.object({ id: z.coerce.number().int().positive() })

const childQuery = z.object({
  /** base64url of the upstream URL. */
  u: z.string().min(1).max(4096),
  /** HMAC over (source id, URL), minted when the playlist was rewritten. */
  t: z.string().min(16).max(64),
})

export const streamRoutes: FastifyPluginAsyncZod = async (app) => {
  // A refused source is a 404 or a 415, not a 500, and the body stays JSON so
  // a player that does read it sees something sensible.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = statusOf(error)
    if (status) return reply.code(status).send({ error: error.message })
    request.log.error({ err: error }, 'stream request failed')
    return reply.code(500).send({ error: 'Internal error' })
  })

  app.get(
    '/:id/index.m3u8',
    {
      config: { rateLimit: { max: env.PROXY_RATE_LIMIT, timeWindow: '1 minute' } },
      schema: {
        operationId: 'streamEntry',
        description: 'Play a source through the server, with its playlist rewritten.',
        params,
        querystring: z.object({ k: z.string().max(256).optional() }),
      },
    },
    controller.entry,
  )

  app.get(
    '/:id/m',
    {
      config: { rateLimit: { max: env.PROXY_RATE_LIMIT, timeWindow: '1 minute' } },
      schema: { operationId: 'streamChildManifest', params, querystring: childQuery },
    },
    controller.childManifest,
  )

  // Segments outnumber playlists by a wide margin, so they get their own,
  // much higher allowance.
  app.get(
    '/:id/s',
    {
      config: { rateLimit: { max: env.PROXY_RATE_LIMIT * 20, timeWindow: '1 minute' } },
      schema: { operationId: 'streamSegment', params, querystring: childQuery },
    },
    controller.segment,
  )

  /** What the proxy is currently carrying, for a dashboard or an alert. */
  app.get('/_capacity', { schema: { operationId: 'proxyCapacity' } }, controller.capacity)
}
