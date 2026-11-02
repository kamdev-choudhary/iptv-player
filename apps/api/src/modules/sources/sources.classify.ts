/**
 * The three properties that decide whether a browser can fetch a stream at
 * all, derived from the URL and the headers it demands. They are stored rather
 * than recomputed so the lineup query can filter on them.
 */

export interface SourceFlags {
  insecure: boolean
  needsHeaders: boolean
  isDash: boolean
}

export function flagsFor(
  url: string,
  userAgent?: string | null,
  referrer?: string | null,
): SourceFlags {
  return {
    insecure: /^http:\/\//i.test(url),
    needsHeaders: Boolean(userAgent || referrer),
    isDash: /\.mpd(\?|$)/i.test(url),
  }
}

/** Pixel height of a published quality label, e.g. `"1080p"` → `1080`. */
export function heightOf(quality: string | null | undefined): number | null {
  const m = /(\d{3,4})\s*[pi]?/.exec(quality ?? '')
  if (!m) return null
  const n = Number(m[1])
  return n >= 100 && n <= 4320 ? n : null
}

/**
 * Whether a browser could fetch this itself. Plain http on an https page and
 * header-gated sources both fail before a request leaves the tab, so the
 * client is told to use the proxy instead of discovering it the slow way.
 */
export function playModeFor(flags: SourceFlags, corsKnownBad: boolean): 'direct' | 'proxy' {
  if (flags.insecure || flags.needsHeaders || corsKnownBad) return 'proxy'
  return 'direct'
}

const HLS_HINT = /\.m3u8(\?|$)/i
const NOT_HLS = /\.(mpd|mp4|m4v|flv|ogg|webm)(\?|$)/i

/** HLS unless the extension says otherwise; most sources carry no extension. */
export function looksLikeHls(url: string) {
  return HLS_HINT.test(url) || !NOT_HLS.test(url)
}
