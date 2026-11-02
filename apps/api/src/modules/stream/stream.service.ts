import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { env } from '../../core/env.ts'
import { NotFoundError, UnprocessableError } from '../../core/errors.ts'
import { Semaphore, fetchUpstream, readCapped } from '../../core/upstream.ts'
import { looksLikeHls } from '../sources/sources.classify.ts'
import { sourceForProxy } from '../catalog/catalog.repository.ts'
import { looksLikePlaylist, rewriteManifest, type ChildKind } from './stream.hls.ts'
import { encodeUrl, sign } from './stream.sign.ts'

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

export const MANIFEST_TYPE = 'application/vnd.apple.mpegurl'

/** Upstream response headers worth passing through; the rest are ours to set. */
const FORWARD_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
] as const

/**
 * A fixed number of permits for upstream fetches. Video is the one thing on
 * this box that arrives faster than it can be forgotten, so the number of open
 * upstreams is capped rather than left to demand.
 */
const upstreams = new Semaphore(env.PROXY_MAX_CONCURRENT)

export const capacity = () => ({
  limit: env.PROXY_MAX_CONCURRENT,
  available: upstreams.available,
  queued: upstreams.queued,
})

export interface ProxySource {
  id: number
  url: string
  userAgent: string | null
  referrer: string | null
}

/**
 * Looks up a source and refuses the ones the proxy must not serve: a hidden
 * channel, a disabled row, or a format this player cannot play anyway.
 */
export async function resolveSource(id: number): Promise<ProxySource> {
  const row = await sourceForProxy(id)
  if (!row || !row.enabled || row.hidden) throw new NotFoundError(`source ${id}`)
  if (row.is_dash) throw new UnprocessableError('MPEG-DASH is not supported')
  return { id: row.id, url: row.url, userAgent: row.user_agent, referrer: row.referrer }
}

/** What the controller should send: either a rewritten playlist, or bytes. */
export type Fetched =
  { kind: 'manifest'; body: string } | { kind: 'stream'; response: Response; release: () => void }

export class UpstreamError extends Error {
  constructor(public status: number) {
    super(`Upstream responded ${status}`)
    this.name = 'UpstreamError'
  }
}

/** The client walked away while queued for a permit; nothing left to answer. */
export class AbandonedError extends Error {
  constructor() {
    super('Client disconnected')
    this.name = 'AbandonedError'
  }
}

/**
 * Fetches one URL on the source's behalf and, when it is a playlist, points
 * every URI inside it back here.
 *
 * Relaying the manifest alone would achieve nothing: the player would read it
 * and then go straight to the origin for each segment, failing for the
 * original reason.
 */
export async function fetchForSource(
  source: ProxySource,
  url: string,
  signal: AbortSignal,
  { range = null as string | null, rewrite = true } = {},
): Promise<Fetched> {
  let release: () => void
  try {
    release = await upstreams.acquire(signal)
  } catch {
    throw new AbandonedError()
  }

  let fetched
  try {
    fetched = await fetchUpstream(url, {
      userAgent: source.userAgent,
      referrer: source.referrer,
      range,
      signal,
    })
  } catch {
    release()
    throw new UpstreamError(502)
  }

  const { response, finalUrl, release: releaseDeadline } = fetched
  // A playlist is read and answered here, so the permit comes back on the way
  // out. A stream outlives this function, so the permit travels with it.
  let handedOff = false
  try {
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new UpstreamError(response.status === 404 ? 404 : 502)
    }

    const isPlaylist = rewrite && looksLikeHls(finalUrl)
    if (!isPlaylist) {
      handedOff = true
      return {
        kind: 'stream',
        response,
        release: () => {
          releaseDeadline()
          release()
        },
      }
    }

    const body = await readCapped(response, 4_000_000)
    if (!looksLikePlaylist(body)) throw new UpstreamError(502)

    const link = (absolute: string, kind: ChildKind) =>
      `/stream/${source.id}/${kind === 'manifest' ? 'm' : 's'}` +
      `?u=${encodeUrl(absolute)}&t=${sign(source.id, absolute)}`

    return { kind: 'manifest', body: rewriteManifest(body, { baseUrl: finalUrl, link }) }
  } finally {
    if (!handedOff) {
      releaseDeadline()
      release()
    }
  }
}

/**
 * Hands an upstream body to the client, holding its permit until the body is
 * done — including when the client closes the tab mid-segment.
 */
export function toNodeStream(response: Response, release: () => void) {
  if (!response.body) {
    release()
    return null
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
  return { stream, done }
}

export function forwardHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of FORWARD_HEADERS) {
    const value = response.headers.get(name)
    if (value) out[name] = value
  }
  // Live segments are immutable once published but the playlist is not; the
  // upstream's own caching advice is not ours to pass on.
  out['cache-control'] = 'no-store'
  return out
}

/**
 * The entry route is the only one that checks the shared token. Child URLs are
 * authorised by their signature instead — they are ours, they name one
 * upstream URL each, and they cannot be minted without the secret.
 */
export function tokenAccepted(queryToken?: string, header?: string) {
  if (!env.STREAM_TOKEN) return true
  const bearer = header?.replace(/^Bearer\s+/i, '')
  return queryToken === env.STREAM_TOKEN || bearer === env.STREAM_TOKEN
}
