import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { env } from '../env.ts'
import { looksLikeHls } from '../lib/classify.ts'
import { looksLikePlaylist, rewriteManifest, type ChildKind } from '../lib/hls.ts'
import { decodeUrl, encodeUrl, sign, verify } from '../lib/sign.ts'
import { Semaphore, fetchUpstream, readCapped } from '../lib/upstream.ts'
import { sourceForProxy } from '../services/catalog.ts'

/**
 * The stream proxy — the part that makes most of this catalog playable.
 *
 * Three browser rules account for the bulk of what used to fail: an https page
 * may not fetch http, a cross-origin read needs the origin's permission, and
 * JavaScript may not set User-Agent or Referer. None of the three apply to a
 * server, so a request routed through here succeeds where the same request
 * from the tab could not.
 *
 * What that costs is honest to state: every byte of video now crosses this
 * box. Clients are told to come here only for sources that need it, and the
 * number of open upstreams is capped.
 */

const MANIFEST_TYPE = 'application/vnd.apple.mpegurl'

/** Upstream response headers worth passing through; the rest are ours to set. */
const FORWARD_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
] as const

const upstreams = new Semaphore(env.PROXY_MAX_CONCURRENT)

const childQuery = z.object({
  /** base64url of the upstream URL. */
  u: z.string().min(1).max(4096),
  /** HMAC over (source id, URL), minted when the playlist was rewritten. */
  t: z.string().min(16).max(64),
})

const params = z.object({ id: z.coerce.number().int().positive() })

/**
 * Aborts when the response closes, which covers both finishing normally and
 * the client walking away mid-segment. Watching the *request* would be wrong:
 * for a GET it completes the moment the headers arrive, long before there is
 * anything to send.
 */
function clientGone(reply: FastifyReply): AbortSignal {
  const controller = new AbortController()
  reply.raw.on('close', () => controller.abort())
  return controller.signal
}

/**
 * The entry point is the only route that checks the shared token. Child URLs
 * are authorised by their signature instead — they are ours, they name one
 * upstream URL each, and they cannot be minted without the secret.
 */
function tokenOk(req: FastifyRequest) {
  if (!env.STREAM_TOKEN) return true
  const query = (req.query as { k?: string } | undefined)?.k
  const header = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  return query === env.STREAM_TOKEN || header === env.STREAM_TOKEN
}

const notPlayable = (reply: FastifyReply, code: number, message: string) =>
  reply.code(code).type('application/json').send({ error: message })

/**
 * Pipes an upstream response to the client, holding a permit until the body is
 * done. Video is the one thing here that arrives faster than it can be
 * forgotten, so the permit is released on every ending — including the client
 * closing the tab mid-segment.
 */
function relay(reply: FastifyReply, response: Response, release: () => void) {
  for (const name of FORWARD_HEADERS) {
    const value = response.headers.get(name)
    if (value) reply.header(name, value)
  }
  // Live segments are immutable once published but the playlist is not; the
  // upstream's own caching advice is not ours to pass on.
  reply.header('cache-control', 'no-store')
  reply.code(response.status)

  if (!response.body) {
    release()
    return reply.send()
  }

  const stream = Readable.fromWeb(response.body as WebReadableStream)
  let released = false
  const done = () => {
    if (released) return
    released = true
    release()
  }
  stream.on('close', done)
  stream.on('error', done)
  reply.raw.on('close', () => {
    stream.destroy()
    done()
  })

  return reply.send(stream)
}

/**
 * Fetches a playlist and points every URI inside it back here. Relaying the
 * manifest alone would achieve nothing: the player would read it and then go
 * straight to the origin for each segment, failing for the original reason.
 */
async function serveManifest(
  reply: FastifyReply,
  sourceId: number,
  url: string,
  headers: { userAgent: string | null; referrer: string | null },
  signal: AbortSignal,
) {
  let release: () => void
  try {
    release = await upstreams.acquire(signal)
  } catch {
    // The client left while queued for a permit.
    return reply
  }

  let fetched
  try {
    fetched = await fetchUpstream(url, { ...headers, signal })
  } catch {
    release()
    return notPlayable(reply, 502, 'Upstream did not respond')
  }

  const { response, finalUrl, release: releaseDeadline } = fetched
  // A playlist is read and answered here, so the permit is given back on the
  // way out. A progressive stream outlives this function, so the permit goes
  // with it instead and must not be released twice.
  let handedOff = false
  try {
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      return notPlayable(reply, response.status === 404 ? 404 : 502, 'Upstream refused the request')
    }

    if (!looksLikeHls(finalUrl)) {
      handedOff = true
      return relay(reply, response, () => {
        releaseDeadline()
        release()
      })
    }

    const body = await readCapped(response, 4_000_000)
    if (!looksLikePlaylist(body)) {
      return notPlayable(reply, 502, 'Upstream did not return a playlist')
    }

    const link = (absolute: string, kind: ChildKind) =>
      `/stream/${sourceId}/${kind === 'manifest' ? 'm' : 's'}` +
      `?u=${encodeUrl(absolute)}&t=${sign(sourceId, absolute)}`

    const rewritten = rewriteManifest(body, { baseUrl: finalUrl, link })
    reply.header('cache-control', 'no-store')
    return reply.type(MANIFEST_TYPE).send(rewritten)
  } finally {
    if (!handedOff) {
      releaseDeadline()
      release()
    }
  }
}

export const streamRoutes: FastifyPluginAsyncZod = async (app) => {
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
    async (req, reply) => {
      if (!tokenOk(req)) return notPlayable(reply, 401, 'This player requires a stream token')

      const source = await sourceForProxy(req.params.id)
      if (!source || !source.enabled || source.hidden) {
        return notPlayable(reply, 404, 'No such source')
      }
      if (source.is_dash) {
        return notPlayable(reply, 415, 'MPEG-DASH is not supported')
      }

      return serveManifest(
        reply,
        source.id,
        source.url,
        { userAgent: source.user_agent, referrer: source.referrer },
        clientGone(reply),
      )
    },
  )

  /** A variant or rendition playlist discovered inside another playlist. */
  app.get(
    '/:id/m',
    {
      config: { rateLimit: { max: env.PROXY_RATE_LIMIT, timeWindow: '1 minute' } },
      schema: { operationId: 'streamChildManifest', params, querystring: childQuery },
    },
    async (req, reply) => {
      const url = decodeUrl(req.query.u)
      if (!url || !verify(req.params.id, url, req.query.t)) {
        return notPlayable(reply, 403, 'Bad or missing signature')
      }

      const source = await sourceForProxy(req.params.id)
      if (!source || !source.enabled || source.hidden) {
        return notPlayable(reply, 404, 'No such source')
      }

      return serveManifest(
        reply,
        source.id,
        url,
        { userAgent: source.user_agent, referrer: source.referrer },
        clientGone(reply),
      )
    },
  )

  /** Segments, AES key blobs and initialisation segments: bytes, passed through. */
  app.get(
    '/:id/s',
    {
      config: { rateLimit: { max: env.PROXY_RATE_LIMIT * 20, timeWindow: '1 minute' } },
      schema: { operationId: 'streamSegment', params, querystring: childQuery },
    },
    async (req, reply) => {
      const url = decodeUrl(req.query.u)
      if (!url || !verify(req.params.id, url, req.query.t)) {
        return notPlayable(reply, 403, 'Bad or missing signature')
      }

      const source = await sourceForProxy(req.params.id)
      if (!source || !source.enabled || source.hidden) {
        return notPlayable(reply, 404, 'No such source')
      }

      const signal = clientGone(reply)
      let release
      try {
        release = await upstreams.acquire(signal)
      } catch {
        // The client left while queued for a permit; nothing to answer.
        return reply
      }
      let fetched
      try {
        fetched = await fetchUpstream(url, {
          userAgent: source.user_agent,
          referrer: source.referrer,
          // Seeking in a VOD asset depends on the range reaching the origin.
          range: req.headers.range ?? null,
          signal,
        })
      } catch {
        release()
        return notPlayable(reply, 502, 'Upstream did not respond')
      }

      const { response, release: releaseDeadline } = fetched
      return relay(reply, response, () => {
        releaseDeadline()
        release()
      })
    },
  )

  /** What the proxy is currently carrying, for a dashboard or an alert. */
  app.get(
    '/_capacity',
    { schema: { operationId: 'proxyCapacity' } },
    async () => ({
      limit: env.PROXY_MAX_CONCURRENT,
      available: upstreams.available,
      queued: upstreams.queued,
    }),
  )
}
