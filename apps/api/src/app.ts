import { isAbsolute, resolve } from 'node:path'
import cors from '@fastify/cors'
import etag from '@fastify/etag'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import underPressure from '@fastify/under-pressure'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { requireAdmin } from './core/auth.ts'
import { db } from './core/db/index.ts'
import { corsOrigin, env, isProduction } from './core/env.ts'
import { statusOf } from './core/errors.ts'
import { catalogRoutes } from './modules/catalog/catalog.routes.ts'
import { importsRoutes } from './modules/imports/imports.routes.ts'
import { jobsRoutes } from './modules/jobs/jobs.routes.ts'
import { sourcesRoutes } from './modules/sources/sources.routes.ts'
import { streamRoutes } from './modules/stream/stream.routes.ts'

/**
 * Where the modules are mounted.
 *
 * Three scopes, because they want different things: the read API wants ETags
 * and a shared cache, the proxy wants neither, and the write API wants a token
 * on every request. A new admin module is protected by being registered in the
 * admin scope rather than by remembering to add a hook.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: isProduction
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true } },
      redact: { paths: ['req.headers.authorization'], censor: '[redacted]' },
    },
    // Proxied behind Caddy or nginx, so the client's real IP comes from a header.
    trustProxy: true,
    // Playlists are small; an imported M3U is not.
    bodyLimit: 16 * 1024 * 1024,
    // Segment responses can be slow without being stuck.
    requestTimeout: 0,
    // A segment request per viewer every few seconds is not worth a log line.
    // Fastify 5 deprecates this in favour of `logController`, whose type wants
    // the whole controller rather than this one field; revisit at Fastify 6.
    disableRequestLogging: isProduction,
  })

  // Zod is the single source of truth for both directions: a request that does
  // not match is rejected, and a response that does not match is a bug caught
  // here rather than in the client.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: 'Request does not match the schema',
        issues: error.validation.map((v) => ({ path: v.instancePath, message: v.message })),
      })
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, url: error.url }, 'response failed its own schema')
      return reply.code(500).send({ error: 'The server built a response it could not validate' })
    }

    const known = statusOf(error)
    if (known) return reply.code(known).send({ error: error.message })

    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
    if (status >= 500) request.log.error({ err: error }, 'request failed')
    return reply.code(status).send({ error: status >= 500 ? 'Internal error' : error.message })
  })

  await app.register(helmet, {
    // The player loads logos from hundreds of broadcaster domains and video
    // from as many more, so a useful CSP cannot be written here. It belongs in
    // the reverse proxy in front, where the deployment's own origins are known.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  })

  await app.register(cors, {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // The player reads these to decide how to range-request a VOD source.
    exposedHeaders: ['content-length', 'content-range', 'accept-ranges'],
    maxAge: 86_400,
  })

  await app.register(rateLimit, {
    global: false,
    max: env.PROXY_RATE_LIMIT,
    timeWindow: '1 minute',
  })

 
  await app.register(underPressure, {
    maxEventLoopDelay: env.PRESSURE_MAX_EVENT_LOOP_DELAY_MS,
    maxRssBytes: env.PRESSURE_MAX_RSS_MB * 1024 * 1024,
    retryAfter: 15,
    exposeStatusRoute: false,
   pressureHandler: (request, reply, type, value) => {
      if (!request.url.startsWith('/stream')) return
      request.log.warn({ type, value, url: request.url }, 'shedding a stream request')
      void reply
        .code(503)
        .header('retry-after', '15')
        .send({ error: 'The server is at capacity. Try again shortly.' })
    },
  })

  // Read API: ETags and a short shared cache.
  await app.register(async (scope) => {
    await scope.register(etag, { weak: true })
    await scope.register(catalogRoutes, { prefix: '/api' })
  })

  // The proxy: no ETag, because the body is the point.
  await app.register(streamRoutes, { prefix: '/stream' })

  // Write API: one token check for every module mounted inside.
  await app.register(
    async (scope) => {
      await scope.register(requireAdmin)
      await scope.register(sourcesRoutes)
      await scope.register(importsRoutes, { prefix: '/import' })
      await scope.register(jobsRoutes, { prefix: '/jobs' })
    },
    { prefix: '/admin' },
  )

  app.get('/health', async (_request, reply) => {
    try {
      await db.selectFrom('channels').select(db.fn.countAll().as('n')).executeTakeFirst()
      return { ok: true, version: process.env.npm_package_version ?? null }
    } catch (error) {
      app.log.error({ err: error }, 'health check could not reach the database')
      return reply.code(503).send({ ok: false, error: 'database unreachable' })
    }
  })

  /**
   * On a single box the client is served from here, which makes it same-origin
   * with the API and the proxy — no CORS to configure, and one TLS certificate.
   */
  if (env.SERVE_WEB) {
    // Resolved against the working directory, not this module: the path has to
    // mean the same thing whether it is `tsx src/index.ts` or `node dist/`.
    const root = isAbsolute(env.WEB_ROOT) ? env.WEB_ROOT : resolve(process.cwd(), env.WEB_ROOT)
    await app.register(fastifyStatic, { root, wildcard: false })
    // The client is a single page; unknown paths are its routes, not 404s.
    app.setNotFoundHandler(async (request, reply) => {
      const api = ['/api', '/stream', '/admin', '/health'].some((p) => request.url.startsWith(p))
      if (api) return reply.code(404).send({ error: 'No such route' })
      return reply.sendFile('index.html')
    })
  }

  return app
}
