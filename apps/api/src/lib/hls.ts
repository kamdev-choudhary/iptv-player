/**
 * Playlist rewriting — the part a naive stream proxy gets wrong.
 *
 * Relaying the manifest alone achieves nothing: the player reads it, then goes
 * straight to the origin for every segment, and those requests fail for the
 * same reason the manifest would have. Every URI inside has to be pointed back
 * at the proxy, including the ones that are easy to miss — variant playlists,
 * AES key blobs, initialisation segments, and the low-latency partial-segment
 * tags.
 */

export type ChildKind = 'manifest' | 'segment'

export interface RewriteOptions {
  /** Where the manifest was actually fetched from, after redirects. */
  baseUrl: string
  /** Returns the proxied URL to put in place of an upstream one. */
  link: (absoluteUrl: string, kind: ChildKind) => string
}

/** Tags whose `URI="…"` attribute points at another playlist. */
const MANIFEST_URI_TAGS = new Set([
  'EXT-X-I-FRAME-STREAM-INF',
  'EXT-X-MEDIA',
  'EXT-X-RENDITION-REPORT',
])

/** Tags whose `URI="…"` attribute points at bytes, not a playlist. */
const SEGMENT_URI_TAGS = new Set([
  'EXT-X-KEY',
  'EXT-X-SESSION-KEY',
  'EXT-X-MAP',
  'EXT-X-PART',
  'EXT-X-PRELOAD-HINT',
  'EXT-X-SESSION-DATA',
])

const URI_ATTR = /\bURI="([^"]*)"/

function tagName(line: string) {
  const end = line.indexOf(':')
  return (end === -1 ? line.slice(1) : line.slice(1, end)).toUpperCase()
}

export function isMasterPlaylist(text: string) {
  return /^#EXT-X-STREAM-INF:/m.test(text)
}

export function looksLikePlaylist(text: string) {
  return text.trimStart().startsWith('#EXTM3U')
}

export function rewriteManifest(text: string, { baseUrl, link }: RewriteOptions): string {
  const absolute = (uri: string) => {
    try {
      return new URL(uri, baseUrl).toString()
    } catch {
      return null
    }
  }

  const proxied = (uri: string, kind: ChildKind) => {
    const abs = absolute(uri)
    return abs ? link(abs, kind) : uri
  }

  const out: string[] = []
  // A bare URI line means a variant playlist when the previous tag announced
  // one, and a media segment otherwise.
  let nextLineIsVariant = false

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const trimmed = line.trim()

    if (!trimmed) {
      out.push(line)
      continue
    }

    if (trimmed.startsWith('#')) {
      const tag = tagName(trimmed)
      if (tag === 'EXT-X-STREAM-INF') {
        nextLineIsVariant = true
        out.push(line)
        continue
      }

      const kind: ChildKind | null = MANIFEST_URI_TAGS.has(tag)
        ? 'manifest'
        : SEGMENT_URI_TAGS.has(tag)
          ? 'segment'
          : null

      if (kind) {
        out.push(
          line.replace(URI_ATTR, (whole, uri: string) =>
            // METHOD=NONE carries no URI, and an empty one must stay empty.
            uri ? `URI="${proxied(uri, kind)}"` : whole,
          ),
        )
        continue
      }

      out.push(line)
      continue
    }

    out.push(proxied(trimmed, nextLineIsVariant ? 'manifest' : 'segment'))
    nextLineIsVariant = false
  }

  return out.join('\n')
}

export interface Variant {
  height: number | null
  bandwidth: number | null
}

/**
 * The renditions a master playlist offers. The health prober stores the best
 * height from here, which is more trustworthy than the published label.
 */
export function parseVariants(text: string): Variant[] {
  const out: Variant[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
    const res = /\bRESOLUTION=(\d+)x(\d+)/i.exec(line)
    const bw = /\b(?:AVERAGE-)?BANDWIDTH=(\d+)/i.exec(line)
    out.push({
      height: res ? Number(res[2]) : null,
      bandwidth: bw ? Number(bw[1]) : null,
    })
  }
  return out
}

/** Best height a playlist advertises, or null when it advertises none. */
export function bestHeight(text: string): number | null {
  const heights = parseVariants(text)
    .map((v) => v.height)
    .filter((h): h is number => typeof h === 'number' && h > 0)
  return heights.length ? Math.max(...heights) : null
}
