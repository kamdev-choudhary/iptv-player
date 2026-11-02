import type Hls from 'hls.js'
import type { ErrorData, Level } from 'hls.js'
import type { ApiSource, HealthReason } from '@tuner/shared'

/**
 * A thin wrapper over hls.js that reduces the many ways a public stream fails
 * to one named reason — the same vocabulary the server's prober uses, so the
 * interface can say one true thing whichever side found out.
 *
 * What is different from the version that had no server: this player no longer
 * has to guess. The API already knows whether a source needs the proxy, so the
 * failure modes left here are the genuinely unpredictable ones.
 */

const START_TIMEOUT = 15_000
const PAGE_IS_HTTPS = typeof location !== 'undefined' && location.protocol === 'https:'

export class StreamError extends Error {
  constructor(public reason: HealthReason) {
    super(reason)
    this.name = 'StreamError'
  }
}

export interface Rendition {
  index: number
  height: number
  bitrate: number
}

/**
 * hls.js is a third of the bundle and useless until someone presses play, so
 * it is fetched on the first tune and kept for the rest of the session.
 */
// Typed as the shape we use rather than `typeof import(…)`, which keeps the
// module's type a static import like every other one in this file.
let hlsModule: { default: typeof Hls } | null = null
async function loadHls() {
  hlsModule ??= await import('hls.js')
  return hlsModule.default
}

const isHlsUrl = (url: string) =>
  /\.m3u8/i.test(url) || !/\.(mpd|mp4|flv|ogg|webm)(\?|$)/i.test(url)

/**
 * A host that refuses cross-origin reads and a host that is simply gone both
 * surface as status 0. An opaque no-cors request still completes for the first
 * and still fails for the second, which is the only way to tell them apart.
 */
async function reachable(url: string) {
  try {
    await fetch(url, { mode: 'no-cors', method: 'GET', cache: 'no-store' })
    return true
  } catch {
    return false
  }
}

async function classify(
  data: ErrorData,
  source: ApiSource,
  viaProxy: boolean,
): Promise<HealthReason> {
  if (data.type === 'mediaError') return 'media'

  const details = String(data.details ?? '')
  if (details.includes('manifestParsing') || details.includes('IncompatibleCodecs'))
    return 'notstream'

  const status = data.response?.code ?? 0
  if (status === 404 || status === 410) return 'gone'
  if (status === 401 || status === 403) return source.needsHeaders ? 'headers' : 'forbidden'
  if (details.includes('TimeOut')) return 'timeout'

  if (status === 0) {
    // Through the proxy, a status of zero is our own server not answering —
    // never a CORS refusal, because the proxy sets its own headers.
    if (viaProxy) return 'network'
    if (source.needsHeaders) return 'headers'
    return (await reachable(source.url)) ? 'cors' : 'network'
  }

  return 'network'
}

export interface PlayerHooks {
  onRenditions?: (renditions: Rendition[]) => void
  /** Fires when the active rendition changes, including automatic switches. */
  onRenditionChange?: (index: number) => void
}

export interface StartOptions {
  /** The URL to load. The caller decides whether it is direct or proxied. */
  url: string
  /** Which of the two it is, which changes how a failure is read. */
  viaProxy: boolean
}

export class Player {
  #video: HTMLVideoElement
  #hls: Hls | null = null
  #timer: ReturnType<typeof setTimeout> | null = null
  /** Bumped on every start and stop, so a late callback knows it is stale. */
  #token = 0
  #hooks: PlayerHooks

  constructor(video: HTMLVideoElement, hooks: PlayerHooks = {}) {
    this.#video = video
    this.#hooks = hooks
  }

  /** Resolves once frames are flowing; rejects with a `StreamError`. */
  async start(source: ApiSource, { url, viaProxy }: StartOptions): Promise<void> {
    const token = ++this.#token
    this.stop(false)

    if (source.dash) throw new StreamError('dash')
    // Only possible when something has gone wrong upstream of here: the API
    // marks these `play: 'proxy'`, so the caller should not have offered direct.
    if (!viaProxy && source.insecure && PAGE_IS_HTTPS) throw new StreamError('insecure')

    if (!isHlsUrl(url)) return this.#playNative(url, token)

    const HlsCtor = await loadHls()
    if (this.#stale(token)) return
    if (HlsCtor.isSupported()) return this.#playHls(HlsCtor, url, source, viaProxy, token)
    // Safari plays HLS in the element itself, where hls.js is unsupported.
    if (this.#video.canPlayType('application/vnd.apple.mpegurl'))
      return this.#playNative(url, token)
    throw new StreamError('unsupported')
  }

  #stale(token: number) {
    return token !== this.#token
  }

  #clearTimer() {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
  }

  #playHls(
    HlsCtor: typeof Hls,
    url: string,
    source: ApiSource,
    viaProxy: boolean,
    token: number,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const hls = new HlsCtor({
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

      const settle = (error: StreamError | null) => {
        this.#clearTimer()
        if (this.#stale(token)) return
        if (error) {
          this.stop(false)
          reject(error)
        } else {
          resolve()
        }
      }

      this.#timer = setTimeout(() => settle(new StreamError('timeout')), START_TIMEOUT)

      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        if (this.#stale(token)) return
        this.#hooks.onRenditions?.(
          hls.levels.map((level: Level, index: number) => ({
            index,
            height: level.height,
            bitrate: level.bitrate,
          })),
        )
        void this.#attemptPlay()
      })

      hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_event, data) => {
        if (!this.#stale(token)) this.#hooks.onRenditionChange?.(data.level)
      })

      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal || this.#stale(token)) return
        // A decode hiccup mid-stream is often recoverable; give it one chance.
        if (data.type === 'mediaError' && !recovered) {
          recovered = true
          hls.recoverMediaError()
          return
        }
        void classify(data, source, viaProxy).then((reason) => settle(new StreamError(reason)))
      })

      this.#video.addEventListener('playing', () => settle(null), { once: true })
      hls.loadSource(url)
      hls.attachMedia(this.#video)
    })
  }

  #playNative(url: string, token: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const video = this.#video
      const settle = (error: StreamError | null) => {
        this.#clearTimer()
        video.removeEventListener('playing', onPlaying)
        video.removeEventListener('error', onError)
        if (this.#stale(token)) return
        if (error) reject(error)
        else resolve()
      }
      const onPlaying = () => settle(null)
      // The element hides the cause, so the generic reason is the honest one.
      const onError = () => settle(new StreamError(video.error?.code === 3 ? 'media' : 'network'))

      video.addEventListener('playing', onPlaying)
      video.addEventListener('error', onError)
      this.#timer = setTimeout(() => settle(new StreamError('timeout')), START_TIMEOUT)
      video.src = url
      void this.#attemptPlay()
    })
  }

  /** Autoplay with sound is usually refused; muted still shows a picture. */
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

/**
 * Whether retrying through the server could plausibly help. The three reasons
 * that are browser rules rather than broken streams, plus the two that are
 * often a route rather than an outage.
 */
export const PROXY_HELPS: readonly HealthReason[] = [
  'cors',
  'insecure',
  'headers',
  'forbidden',
  'network',
  'timeout',
]

/**
 * Retrying these changes nothing: the obstacle is a fixed property of the
 * source or the browser, not a server having a bad minute. Offering a retry
 * for them is a dead end dressed up as a way out.
 */
export const DETERMINISTIC: readonly HealthReason[] = ['dash', 'unsupported', 'insecure', 'headers']
