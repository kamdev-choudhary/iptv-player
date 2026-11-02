import type { HealthReason, ProbeResult } from '@tuner/shared'
import { looksLikeHls } from '../lib/classify.ts'
import { bestHeight, isMasterPlaylist, looksLikePlaylist, parseVariants } from '../lib/hls.ts'
import { fetchUpstream, readCapped } from '../lib/upstream.ts'

/**
 * Asks a source whether it is alive, from the server's point of view.
 *
 * The distinction that matters: `ok` means *this box* can fetch it, which is
 * all the proxy needs. Whether a *browser* could fetch it directly is a
 * separate question, answered by the `cors` field. A source can be perfectly
 * healthy and still require the proxy, and the two are recorded apart so the
 * client is never told to retry something that cannot work.
 */

export interface ProbeInput {
  url: string
  userAgent?: string | null
  referrer?: string | null
  /** Follow one variant playlist to confirm the renditions resolve too. */
  deep?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

const DASH = /\.mpd(\?|$)/i

/**
 * A wildcard, or any explicit origin, means a browser would be allowed to read
 * the response. A missing header means it would not.
 */
function corsAllows(headers: Headers) {
  const value = headers.get('access-control-allow-origin')
  if (!value) return false
  return value.trim() === '*' || /^https?:\/\//i.test(value.trim())
}

function reasonForStatus(status: number, needsHeaders: boolean): HealthReason {
  if (status === 404 || status === 410) return 'gone'
  if (status === 401 || status === 403) return (needsHeaders ? 'headers' : 'forbidden')
  if (status === 451) return 'forbidden'
  if (status === 408 || status === 504) return 'timeout'
  return 'network'
}

function reasonForThrow(err: unknown): HealthReason {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : String(err)
  if (name === 'TimeoutError' || /timed? ?out/i.test(message)) return 'timeout'
  if (name === 'AbortError') return 'timeout'
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ERR_TLS|certificate/i.test(message))
    return 'network'
  return 'network'
}

export async function probeSource(input: ProbeInput): Promise<ProbeResult> {
  const started = Date.now()
  const fail = (reason: HealthReason, status: number | null = null): ProbeResult => ({
    ok: false,
    reason,
    status,
    latencyMs: Date.now() - started,
    height: null,
    cors: null,
    variants: [],
  })

  if (DASH.test(input.url)) return { ...fail('dash'), latencyMs: 0 }

  let first
  try {
    first = await fetchUpstream(input.url, {
      userAgent: input.userAgent,
      referrer: input.referrer,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    })
  } catch (err) {
    return fail(reasonForThrow(err))
  }

  const { response, finalUrl, release } = first
  try {
    const needsHeaders = Boolean(input.userAgent || input.referrer)
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      return fail(reasonForStatus(response.status, needsHeaders), response.status)
    }

    const cors = corsAllows(response.headers)
    const latencyMs = Date.now() - started

    // Not HLS and not a playlist: as long as bytes are flowing it is a
    // progressive stream the proxy can relay, so do not read it.
    if (!looksLikeHls(finalUrl)) {
      await response.body?.cancel().catch(() => {})
      return { ok: true, reason: 'ok', status: response.status, latencyMs, height: null, cors, variants: [] }
    }

    const body = await readCapped(response, 512_000)
    if (!looksLikePlaylist(body)) {
      return { ...fail('notstream', response.status), cors }
    }

    const variants = parseVariants(body)
    let height = bestHeight(body)

    if (input.deep && isMasterPlaylist(body)) {
      const child = await probeVariant(body, finalUrl, input)
      if (child && !child.ok) return { ...child, cors, variants }
      height ??= child?.height ?? null
    }

    return { ok: true, reason: 'ok', status: response.status, latencyMs, height, cors, variants }
  } finally {
    release()
  }
}

/**
 * A dead stream very often still serves its master playlist while every
 * rendition under it 404s, so the first variant is checked as well.
 */
async function probeVariant(
  master: string,
  baseUrl: string,
  input: ProbeInput,
): Promise<ProbeResult | null> {
  const lines = master.split('\n').map((l) => l.trim())
  const at = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF:'))
  const uri = lines.slice(at + 1).find((l) => l && !l.startsWith('#'))
  if (!uri) return null

  let target: string
  try {
    target = new URL(uri, baseUrl).toString()
  } catch {
    return null
  }

  return probeSource({ ...input, url: target, deep: false })
}
