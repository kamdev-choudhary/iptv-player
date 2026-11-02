/**
 * Extended M3U into the shape the database stores.
 *
 * Providers are inconsistent about everything: the header is sometimes
 * missing, the same channel appears several times as alternative sources, and
 * per-stream headers arrive either as `#EXTVLCOPT` lines or as `|`-appended
 * query junk. All of that is normalised here so the rest of the system only
 * ever sees a channel with sources.
 */

const ATTR = /([\w-]+)="([^"]*)"/g

export interface ParsedSource {
  url: string
  userAgent: string | null
  referrer: string | null
}

export interface ParsedChannel {
  key: string
  name: string
  logo: string | null
  country: string | null
  language: string | null
  categories: string[]
  sources: ParsedSource[]
}

function attrs(line: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [, k, v] of line.matchAll(ATTR)) out[k.toLowerCase()] = v
  return out
}

export function slug(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

/**
 * Some playlists append headers to the URL as `url|User-Agent=x&Referer=y`,
 * which is not part of the address and would 404 if sent as one.
 */
function splitPipedHeaders(raw: string): ParsedSource {
  const at = raw.indexOf('|')
  if (at === -1) return { url: raw, userAgent: null, referrer: null }

  const url = raw.slice(0, at)
  const params = new URLSearchParams(raw.slice(at + 1))
  const get = (...names: string[]) => {
    for (const [k, v] of params) {
      if (names.includes(k.toLowerCase()) && v) return v
    }
    return null
  }
  return {
    url,
    userAgent: get('user-agent', 'useragent'),
    referrer: get('referer', 'referrer'),
  }
}

interface Pending {
  name: string
  logo: string | null
  country: string | null
  language: string | null
  categories: string[]
  userAgent: string | null
  referrer: string | null
}

const blank = (): Pending => ({
  name: '',
  logo: null,
  country: null,
  language: null,
  categories: [],
  userAgent: null,
  referrer: null,
})

export function parseM3u(text: string): ParsedChannel[] {
  const lines = text.split(/\r?\n/)
  const channels: ParsedChannel[] = []
  const byKey = new Map<string, ParsedChannel>()
  let pending = blank()

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('#EXTINF:')) {
      const a = attrs(line)
      const title = line.slice(line.lastIndexOf(',') + 1).trim()
      pending = {
        ...blank(),
        name: a['tvg-name'] || title || 'Untitled channel',
        logo: a['tvg-logo'] || null,
        country: (a['tvg-country'] || '').split(/[;,]/)[0]?.trim().toUpperCase() || null,
        language: (a['tvg-language'] || '').split(/[;,]/)[0]?.trim() || null,
        categories: (a['group-title'] || '')
          .split(/[;,]/)
          .map((c) => c.trim())
          .filter(Boolean),
      }
      continue
    }

    // VLC options carry the headers a stream insists on, which is exactly what
    // the proxy needs and a browser cannot supply.
    if (line.startsWith('#EXTVLCOPT:')) {
      const [key, ...rest] = line.slice('#EXTVLCOPT:'.length).split('=')
      const value = rest.join('=').trim()
      const name = key?.trim().toLowerCase()
      if (name === 'http-user-agent') pending.userAgent = value
      if (name === 'http-referrer' || name === 'http-referer') pending.referrer = value
      continue
    }

    if (line.startsWith('#EXTHTTP:')) {
      try {
        const parsed = JSON.parse(line.slice('#EXTHTTP:'.length)) as Record<string, string>
        for (const [k, v] of Object.entries(parsed)) {
          const name = k.toLowerCase()
          if (name === 'user-agent') pending.userAgent = v
          if (name === 'referer' || name === 'referrer') pending.referrer = v
        }
      } catch {
        // Malformed JSON here is common and costs nothing to ignore.
      }
      continue
    }

    if (line.startsWith('#')) continue
    if (!/^https?:\/\//i.test(line)) continue

    const piped = splitPipedHeaders(line)
    const source: ParsedSource = {
      url: piped.url,
      userAgent: piped.userAgent ?? pending.userAgent,
      referrer: piped.referrer ?? pending.referrer,
    }

    const name = pending.name || 'Untitled channel'
    const key = slug(name) || slug(source.url)
    const existing = byKey.get(key)

    if (existing) {
      // A repeated name is another source for one channel, not a duplicate.
      if (!existing.sources.some((s) => s.url === source.url)) existing.sources.push(source)
    } else {
      const channel: ParsedChannel = {
        key,
        name,
        logo: pending.logo,
        country: pending.country && /^[A-Z]{2}$/.test(pending.country) ? pending.country : null,
        language: pending.language,
        categories: pending.categories,
        sources: [source],
      }
      byKey.set(key, channel)
      channels.push(channel)
    }

    pending = blank()
  }

  return channels
}
