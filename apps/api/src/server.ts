import { isAbsolute, resolve } from 'node:path'
import cors from '@fastify/cors'
import etag from '@fastify/etag'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { corsOrigin, env, isProduction } from './env.ts'
import { db } from './db/index.ts'
import { adminRoutes } from './routes/admin.ts'
import { catalogRoutes } from './routes/catalog.ts'
import { streamRoutes } from './routes/stream.ts'

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: isProduction ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
      // A proxied segment URL carries the upstream address; useful in a log,
      // and not something to repeat for every request at info level.
      redact: { paths: ['req.headers.authorization'], censor: '[redacted]' },
    },
    // Proxied behind Caddy or nginx, so the client's real IP comes from a header.
    trustProxy: true,
    // Playlists are small; an imported M3U is not.
    bodyLimit: 16 * 1024 * 1024,
    // Segment responses can be slow without being stuck.
    requestTimeout: 0,
    disableRequestLogging: isProduction,
  })

  // Zod is the single source of truth for both directions: a request that does
  // not match is rejected, and a response that does not match is a bug caught
  // here rather than in the client.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: 'Request does not match the schema',
        issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
      })
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err, route: err.method, url: err.url }, 'response failed its own schema')
      return reply.code(500).send({ error: 'The server built a response it could not validate' })
    }
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500
    if (status >= 500) req.log.error({ err }, 'request failed')
    return reply.code(status).send({ error: status >= 500 ? 'Internal error' : err.message })
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

  // ETags on the catalog; never on a stream, where the body is the point.
  await app.register(async (scope) => {
    await scope.register(etag, { weak: true })
    await scope.register(catalogRoutes, { prefix: '/api' })
  })

  await app.register(streamRoutes, { prefix: '/stream' })
  await app.register(adminRoutes, { prefix: '/admin' })

  app.get('/health', async (_req, reply) => {
    try {
      await db.selectFrom('channels').select(db.fn.countAll().as('n')).executeTakeFirst()
      return { ok: true, version: process.env.npm_package_version ?? null }
    } catch (err) {
      app.log.error({ err }, 'health check could not reach the database')
      return reply.code(503).send({ ok: false, error: 'database unreachable' })
    }
  })

  /**
   * On a single box the client is served from here, which makes it same-origin
   * with the API and the proxy — no CORS to configure, and one TLS certificate.
   */
  if (env.SERVE_WEB) {
    // Resolved against the working directory, not this module: the path has
    // to mean the same thing whether it is `tsx src/index.ts` or `node dist/`.
    const root = isAbsolute(env.WEB_ROOT) ? env.WEB_ROOT : resolve(process.cwd(), env.WEB_ROOT)
    await app.register(fastifyStatic, { root, wildcard: false })
    // The client is a single page; unknown paths are its routes, not 404s.
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/stream') || req.url.startsWith('/admin')) {
        return reply.code(404).send({ error: 'No such route' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}
