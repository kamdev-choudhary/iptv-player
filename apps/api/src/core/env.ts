import { z } from 'zod'

/**
 * Configuration is read once, validated, and frozen. A missing secret should
 * stop the process at boot rather than surface as a 500 on the first request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Run pending migrations on boot. Convenient on one box, risky on many. */
  MIGRATE_ON_BOOT: z.stringbool().default(true),

  /**
   * Signs the upstream URLs embedded in rewritten playlists. Without it the
   * segment route would relay any URL handed to it — an open proxy.
   */
  STREAM_SECRET: z.string().min(16),
  /** When set, admin routes require this as a bearer token; otherwise they are refused. */
  ADMIN_TOKEN: z.string().min(16).optional(),
  /** When set, the stream proxy requires it too. Leave unset for an open player. */
  STREAM_TOKEN: z.string().min(8).optional(),

  /** Comma-separated origins, or `*`. The client is usually same-origin in production. */
  CORS_ORIGIN: z.string().default('*'),

  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  /** Cap on simultaneous upstream stream fetches, so one box cannot be drowned. */
  PROXY_MAX_CONCURRENT: z.coerce.number().int().min(1).max(10_000).default(200),
  /** Requests per minute per IP against the proxy. */
  PROXY_RATE_LIMIT: z.coerce.number().int().min(1).default(600),

  /** Whether this process runs the scheduled jobs. Off on extra web replicas. */
  RUN_JOBS: z.stringbool().default(true),
  SYNC_CRON: z.string().default('30 5 * * *'),
  HEALTH_CRON: z.string().default('0 */6 * * *'),
  IPTV_ORG_API: z.string().default('https://iptv-org.github.io/api'),

  /** Serve the built client from the API, which is the single-VPS layout. */
  SERVE_WEB: z.stringbool().default(false),
  WEB_ROOT: z.string().default('../web/dist'),
})

/**
 * In a `.env` file, a variable left blank means "I am not using this" — the
 * commented-out `STREAM_TOKEN=` in `.env.example` is the obvious case. Treating
 * an empty string as a value would fail validation on a file that is correct.
 */
const present = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
)

const parsed = schema.safeParse(present)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
  console.error(`Invalid environment:\n${issues}\n\nSee .env.example.`)
  process.exit(1)
}

export const env = Object.freeze(parsed.data)
export type Env = typeof env

export const isProduction = env.NODE_ENV === 'production'

/** `*` or an explicit allow-list, in the shape @fastify/cors wants. */
export const corsOrigin: string | string[] | boolean =
  env.CORS_ORIGIN === '*'
    ? true
    : env.CORS_ORIGIN.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
