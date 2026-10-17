/**
 * Thin wrapper over hls.js that turns the many ways a public stream can fail
 * into a single named reason, so the interface can say something true about it.
 */
import type Hls from 'hls.js'
import type { ErrorData, Level } from 'hls.js'
import type { Source } from './types'

const START_TIMEOUT = 15_000
const PAGE_IS_HTTPS = location.protocol === 'https:'

export type Reason =
  | 'insecure'
  | 'dash'
  | 'headers'
  | 'cors'
  | 'gone'
  | 'forbidden'
  | 'timeout'
  | 'media'
  | 'notstream'
  | 'unsupported'
  | 'network'

/** Reasons, each with copy the player shows verbatim. */
export const REASONS: Record<Reason, { head: string; body: string }> = {
  insecure: {
    head: 'Blocked by the browser',
    body: 'This source is served over plain http, and a page loaded over https is not allowed to fetch it. Other sources for this channel may still work.',
  },
  dash: {
    head: 'Format not supported',
    body: 'This is an MPEG-DASH stream. Tuner plays HLS only, which covers almost every other source in the list.',
  },
  headers: {
    head: 'Stream needs a desktop player',
    body: 'This source only answers requests carrying a specific User-Agent or Referer, and browsers forbid a page from setting either. It will play in VLC or mpv.',
  },
  cors: {
    head: 'Broadcaster refused the browser',
    body: 'The server is up but does not allow other sites to read it, so the browser dropped the response. A CORS proxy in Settings gets around this.',
  },
  gone: {
    head: 'Source is gone',
    body: 'The server answered, but there is nothing at this address any more.',
  },
  forbidden: {
    head: 'Not available here',
    body: 'The server refused the request. This usually means the channel is limited to viewers in another country.',
  },
  timeout: {
    head: 'No response',
    body: 'The server took too long to send anything back.',
  },
  media: {
    head: 'Stream is unreadable',
    body: 'Video arrived but the browser could not decode it, which usually means a codec it does not ship.',
  },
  notstream: {
    head: 'Not a stream any more',
    body: 'The address answered, but with something that is not a playlist — usually a shutdown notice left where the stream used to be.',
  },
  unsupported: {
    head: 'Playback unavailable',
    body: 'This browser cannot play HLS. Chrome, Edge, Firefox and Safari all can.',
  },
  network: {
    head: 'Source is not responding',
    body: 'The stream could not be reached. It may be offline, or briefly overloaded.',
  },
}

export interface Rendition {
  i: number
  height: number
  bitrate: number
}

export class StreamError extends Error {
  constructor(public reason: Reason) {
    super(reason)
    this.name = 'StreamError'
  }
}

const isHls = (url: string) => /\.m3u8/i.test(url) || !/\.(mpd|mp4|flv|ogg|ts)(\?|$)/i.test(url)

/**
 * hls.js is a third of the bundle and useless until someone presses play, so
 * it is fetched on the first tune and kept for the rest of the session.
 */
let hlsModule: typeof import('hls.js') | null = null
async function loadHls() {
  hlsModule ??= await import('hls.js')
  return hlsModule.default
}

/**
 * A host that refuses cross-origin reads and a host that is simply gone both
 * surface as status 0. An opaque no-cors request still completes for the first
 * and still fails for the second, which is the only way to tell them apart.
 */
async function reachable(url: string) {
  try {
    await fetch(url, { mode: 'no-cors', method: 'GET', cache: 'no-store', redirect: 'follow' })
    return true
  } catch {
    return false
  }
}

async function classify(data: ErrorData, source: Source, url: string): Promise<Reason> {
  if (data.type === 'mediaError') return 'media'
  const details = String(data.details || '')
  if (details.includes('manifestParsing') || details.includes('IncompatibleCodecs')) return 'notstream'
  const status = data.response?.code ?? 0
  if (status === 404 || status === 410) return 'gone'
  if (status === 401 || status === 403) return source.h ? 'headers' : 'forbidden'
  if (details.includes('TimeOut')) return 'timeout'
  if (status === 0) {
    if (source.h) return 'headers'
    return (await reachable(url)) ? 'cors' : 'network'
  }
  return 'network'
}

export interface PlayerHooks {
  /** Called with the available renditions once a manifest parses. */
  onRenditions?: (levels: Rendition[]) => void
}

export class Player {
  #video: HTMLVideoElement
  #hls: Hls | null = null
  #timer: ReturnType<typeof setTimeout> | null = null
  #token = 0
  #hooks: PlayerHooks

  constructor(video: HTMLVideoElement, hooks: PlayerHooks = {}) {
    this.#video = video
    this.#hooks = hooks
  }

  /**
   * Starts one source. Resolves once frames are flowing; rejects with a
   * `StreamError` naming the reason.
   */
  async start(source: Source, { proxy = '' } = {}): Promise<void> {
    const token = ++this.#token
    this.stop(false)

    if (source.x && PAGE_IS_HTTPS && !proxy) throw new StreamError('insecure')
    if (source.d) throw new StreamError('dash')

    const url = proxy ? proxy + encodeURIComponent(source.u) : source.u

    if (!isHls(url)) return this.#playNative(url, token)

    const Hls = await loadHls()
    if (this.#settled(token)) return
    if (Hls.isSupported()) return this.#playHls(Hls, url, source, token)
    // Safari and iOS play HLS in the element itself, where hls.js is unsupported.
    if (this.#video.canPlayType('application/vnd.apple.mpegurl')) return this.#playNative(url, token)
    throw new StreamError('unsupported')
  }

  #settled(token: number) {
    return token !== this.#token
  }

  #clearTimer() {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
  }

  #playHls(Ctor: typeof Hls, url: string, source: Source, token: number) {
    return new Promise<void>((resolve, reject) => {
      const hls = new Ctor({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        manifestLoadingTimeOut: 12_000,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 3,
      })
      this.#hls = hls
      let recovered = false

      const done = (err: StreamError | null) => {
        this.#clearTimer()
        if (this.#settled(token)) return
        if (err) {
          this.stop(false)
          reject(err)
        } else resolve()
      }

      this.#timer = setTimeout(() => done(new StreamError('timeout')), START_TIMEOUT)

      hls.on(Ctor.Events.MANIFEST_PARSED, () => {
        if (this.#settled(token)) return
        this.#hooks.onRenditions?.(
          hls.levels.map((l: Level, i: number) => ({
            i,
            height: l.height,
            bitrate: l.bitrate,
          })),
        )
        void this.#attemptPlay()
      })

      hls.on(Ctor.Events.ERROR, (_e, data) => {
        if (!data.fatal || this.#settled(token)) return
        // A decode hiccup mid-stream is often recoverable; give it one chance.
        if (data.type === 'mediaError' && !recovered) {
          recovered = true
          hls.recoverMediaError()
          return
        }
        void classify(data, source, url).then((reason) => done(new StreamError(reason)))
      })

      this.#video.addEventListener('playing', () => done(null), { once: true })
      hls.loadSource(url)
      hls.attachMedia(this.#video)
    })
  }

  #playNative(url: string, token: number) {
    return new Promise<void>((resolve, reject) => {
      const video = this.#video
      const done = (err: StreamError | null) => {
        this.#clearTimer()
        video.removeEventListener('playing', ok)
        video.removeEventListener('error', bad)
        if (this.#settled(token)) return
        if (err) reject(err)
        else resolve()
      }
      const ok = () => done(null)
      // The element hides the cause, so the generic reason is the honest one.
      const bad = () => done(new StreamError(video.error?.code === 3 ? 'media' : 'network'))

      video.addEventListener('playing', ok)
      video.addEventListener('error', bad)
      this.#timer = setTimeout(() => done(new StreamError('timeout')), START_TIMEOUT)
      video.src = url
      void this.#attemptPlay()
    })
  }

  /** Autoplay with sound is usually refused; falling back to muted still shows picture. */
  async #attemptPlay() {
    try {
      await this.#video.play()
    } catch {
      this.#video.muted = true
      try {
        await this.#video.play()
      } catch {
        // The element's own controls remain.
      }
    }
  }

  setRendition(index: number) {
    if (this.#hls) this.#hls.currentLevel = index
  }

  stop(bumpToken = true) {
    if (bumpToken) this.#token++
    this.#clearTimer()
    if (this.#hls) {
      this.#hls.destroy()
      this.#hls = null
    }
    this.#video.removeAttribute('src')
    this.#video.load()
  }
}
