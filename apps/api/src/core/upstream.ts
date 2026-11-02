import { env } from './env.ts'

/**
 * One place to reach a broadcaster from. Two things here matter more than they
 * look: a browser-shaped default User-Agent, which a surprising number of
 * origins insist on before they answer at all, and a hard timeout, without
 * which a single unresponsive host would hold a connection until the pool ran
 * dry.
 */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

export interface UpstreamRequest {
  method?: 'GET' | 'HEAD'
  userAgent?: string | null
  referrer?: string | null
  range?: string | null
  timeoutMs?: number
  signal?: AbortSignal
}

export function upstreamHeaders(req: UpstreamRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': req.userAgent || DEFAULT_USER_AGENT,
    accept: '*/*',
    'accept-encoding': 'identity',
  }
  if (req.referrer) {
    headers.referer = req.referrer
    // Origin without a path: some CDNs check it instead of Referer.
    try {
      headers.origin = new URL(req.referrer).origin
    } catch {
      // A malformed referrer is still worth sending as-is.
    }
  }
  if (req.range) headers.range = req.range
  return headers
}

/**
 * Combines a caller's abort signal with a deadline, so a client that goes away
 * and a server that stops talking both release the upstream connection.
 */
function deadline(req: UpstreamRequest): { signal: AbortSignal; done: () => void } {
  const timeout = AbortSignal.timeout(req.timeoutMs ?? env.UPSTREAM_TIMEOUT_MS)
  if (!req.signal) return { signal: timeout, done: () => {} }
  const controller = new AbortController()
  const abort = () => controller.abort()
  timeout.addEventListener('abort', abort, { once: true })
  req.signal.addEventListener('abort', abort, { once: true })
  return {
    signal: controller.signal,
    done: () => {
      timeout.removeEventListener('abort', abort)
      req.signal?.removeEventListener('abort', abort)
    },
  }
}

export interface UpstreamResponse {
  response: Response
  /** The URL after redirects, which is what relative playlist URIs resolve against. */
  finalUrl: string
  release: () => void
}

export async function fetchUpstream(
  url: string,
  req: UpstreamRequest = {},
): Promise<UpstreamResponse> {
  const { signal, done } = deadline(req)
  try {
    const response = await fetch(url, {
      method: req.method ?? 'GET',
      headers: upstreamHeaders(req),
      redirect: 'follow',
      signal,
      // Broadcaster cookies are never ours to carry.
      credentials: 'omit',
    })
    return { response, finalUrl: response.url || url, release: done }
  } catch (err) {
    done()
    throw err
  }
}

/** Reads at most `limit` bytes as text, so a mislabelled video cannot fill memory. */
export async function readCapped(response: Response, limit = 1_000_000): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done: finished, value } = await reader.read()
      if (finished) break
      if (!value) continue
      chunks.push(value)
      size += value.byteLength
      if (size >= limit) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)))
    .subarray(0, limit)
    .toString('utf8')
}

/**
 * A fixed number of permits for upstream stream fetches. Video is the one
 * thing on this box that arrives faster than it can be forgotten, so the
 * number of open upstreams is capped rather than left to demand.
 */
export class Semaphore {
  #free: number
  #waiting: Array<() => void> = []

  constructor(permits: number) {
    this.#free = permits
  }

  get available() {
    return this.#free
  }

  get queued() {
    return this.#waiting.length
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.#free > 0) {
      this.#free--
      return this.#releaseOnce()
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        this.#waiting = this.#waiting.filter((w) => w !== wake)
        reject(new Error('aborted'))
      }
      const wake = () => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      this.#waiting.push(wake)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
    this.#free--
    return this.#releaseOnce()
  }

  #releaseOnce() {
    let released = false
    return () => {
      if (released) return
      released = true
      this.#free++
      this.#waiting.shift()?.()
    }
  }
}

/** Runs `work` over `items` with a fixed number of workers, in order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = Array.from<R>({ length: items.length })
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await work(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}
