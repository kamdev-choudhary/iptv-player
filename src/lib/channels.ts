/**
 * The search, filter and sort layer. Pure functions over the loaded index, so
 * the 11k-row pass stays measurable and testable on its own.
 */
import type { Channel, ChannelIndex, Filters, Source, SortKey } from './types'

/** The seven SMPTE bars, as CSS custom-property names. */
export const HUES = [
  '--bar-cyan',
  '--bar-yellow',
  '--bar-green',
  '--bar-magenta',
  '--bar-red',
  '--bar-blue',
] as const

export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** A stable bar per channel, so a name always comes back the same colour. */
export function hueFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return `var(${HUES[h % HUES.length]})`
}

/** Fallback mark for a channel with no logo, or one whose logo 404s. */
export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}

export function qualityLabel(ch: Channel) {
  return ch.q ? `${ch.q}p` : '—'
}

/** Pixel height of a quality string, for ranking renditions and sources. */
export function heightOf(q: string | undefined) {
  const m = /^(\d+)/.exec(q || '')
  return m ? Number(m[1]) : 0
}

/** A lookup built once per index load and threaded through the UI. */
export interface Catalog {
  index: ChannelIndex | null
  byId: Map<string, Channel>
  sources: Record<string, Source[]>
  sourcesReady: boolean
}

export const EMPTY_CATALOG: Catalog = {
  index: null,
  byId: new Map(),
  sources: {},
  sourcesReady: false,
}

export const countryName = (cat: Catalog, code?: string) =>
  (code && cat.index?.countries[code]?.[0]) || code || ''

export const flagOf = (cat: Catalog, code?: string) =>
  (code && cat.index?.countries[code]?.[1]) || ''

export const categoryName = (cat: Catalog, id: string) => cat.index?.categories[id] || id

export const languageName = (cat: Catalog, code: string) => cat.index?.languages[code] || code

/** Sources for a channel: from the lazy-loaded index, or inline for playlists. */
export const sourcesFor = (cat: Catalog, ch: Channel): Source[] => ch.s ?? cat.sources[ch.i] ?? []

/**
 * One folded haystack per channel. Searching 11k rows on every keystroke is
 * only instant because this is precomputed.
 */
export function indexForSearch(ch: Channel, cat: Catalog) {
  ch._h = fold(
    [
      ch.n,
      ...(ch.a || []),
      countryName(cat, ch.c),
      (ch.g || []).map((g) => categoryName(cat, g)).join(' '),
    ].join(' '),
  )
}

/** Higher is a better match; 0 drops the channel. */
function score(ch: Channel, tokens: string[]) {
  const name = fold(ch.n)
  let total = 0
  for (const t of tokens) {
    if (name.startsWith(t)) total += 100
    else if (name.includes(` ${t}`)) total += 70
    else if (name.includes(t)) total += 45
    else if (ch._h?.includes(t)) total += 20
    else return 0
  }
  return total
}

function passes(ch: Channel, f: Filters, cat: Catalog) {
  if (f.country && ch.c !== f.country) return false
  if (f.language && !(ch.l || []).includes(f.language)) return false
  if (f.quality && (ch.q || 0) < f.quality) return false
  if (f.categories.length && !(ch.g || []).some((g) => f.categories.includes(g))) return false
  if (f.hideUnmatched && ch.u) return false
  if (f.hideInsecure && ch.x) return false
  if (f.hideGeoBlocked || f.hidePartTime) {
    const src = sourcesFor(cat, ch)
    // Before sources arrive these two filters cannot be judged, so nothing is hidden.
    if (src.length) {
      const allTagged = (want: string) => src.every((s) => (s.b || []).includes(want))
      if (f.hideGeoBlocked && allTagged('Geo-blocked')) return false
      if (f.hidePartTime && allTagged('Not 24/7')) return false
    }
  }
  return true
}

function sortList(list: Channel[], by: SortKey) {
  if (by === 'quality')
    return [...list].sort((a, b) => (b.q || 0) - (a.q || 0) || a.n.localeCompare(b.n))
  if (by === 'sources')
    return [...list].sort((a, b) => (b.k || 0) - (a.k || 0) || a.n.localeCompare(b.n))
  return list
}

export interface QueryArgs {
  pool: Channel[]
  query: string
  filters: Filters
  sort: SortKey
  catalog: Catalog
  /** Favourites and recents are already in a meaningful order; leave it be. */
  preserveOrder?: boolean
}

export function runQuery({ pool, query, filters, sort, catalog, preserveOrder }: QueryArgs) {
  const tokens = fold(query.trim()).split(/\s+/).filter(Boolean)
  let list = pool.filter((ch) => passes(ch, filters, catalog))

  if (tokens.length) {
    list = list
      .map((ch) => ({ ch, s: score(ch, tokens) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.ch.n.localeCompare(b.ch.n))
      .map((x) => x.ch)
  } else if (!preserveOrder) {
    list = sortList(list, sort)
  }

  return list
}

export function activeFilterCount(f: Filters) {
  return (
    (f.country ? 1 : 0) +
    (f.language ? 1 : 0) +
    (f.quality ? 1 : 0) +
    f.categories.length +
    (f.hideUnmatched ? 1 : 0) +
    (f.hideGeoBlocked ? 1 : 0) +
    (f.hidePartTime ? 1 : 0)
  )
}

/** What a source offers, as short notes for the source picker. */
export function sourceNotes(s: Source) {
  return [
    s.q,
    s.f,
    ...(s.b || []),
    s.x ? 'http' : null,
    s.d ? 'DASH' : null,
    s.h ? 'needs headers' : null,
  ].filter(Boolean) as string[]
}
