/**
 * The shapes in `data/*.json`, written by `scripts/build-data.mjs`.
 *
 * Keys are one letter because the index holds ~11k channels and ~30k sources;
 * spelling them out adds about a megabyte over the wire for no gain.
 */

export interface Source {
  /** Stream URL. */
  u: string
  /** Quality as published, e.g. `"1080p"`. */
  q?: string
  /** Feed name, when this is not the channel's main feed. */
  f?: string
  /** Labels from iptv-org, e.g. `"Geo-blocked"`, `"Not 24/7"`. */
  b?: string[]
  /** Served over plain http, which an https page may not load. */
  x?: 1
  /** Needs a User-Agent or Referer that JavaScript is forbidden to set. */
  h?: 1
  /** MPEG-DASH, which hls.js does not handle. */
  d?: 1
}

export interface Channel {
  /** Stable id, also the deep-link key. */
  i: string
  /** Display name. */
  n: string
  /** How many sources are listed. */
  k?: number
  /** Best source height in pixels, for sorting and the quality filter. */
  q?: number
  /** Nothing here a browser can play. */
  x?: 1
  /** ISO country code. */
  c?: string
  /** Category ids. */
  g?: string[]
  /** Language codes. */
  l?: string[]
  /** Logo URL. */
  o?: string
  /** Alternative names, searchable. */
  a?: string[]
  /** Channel website. */
  w?: string
  /** No database entry behind it — a stream matched only by its title. */
  u?: 1
  /** Sources carried inline. Only user playlists do this. */
  s?: Source[]
  /** Came from a playlist the user imported. */
  p?: 1
  /** Folded search haystack, built once on load. Never serialised. */
  _h?: string
}

export interface ChannelIndex {
  generated: string
  source: string
  /** code -> [name, flag emoji] */
  countries: Record<string, [string, string]>
  /** id -> name */
  categories: Record<string, string>
  /** code -> name */
  languages: Record<string, string>
  channels: Channel[]
}

export interface SourceIndex {
  generated: string
  sources: Record<string, Source[]>
}

export type LibraryView = 'all' | 'favorites' | 'recent' | 'playlist'

export type SortKey = 'name' | 'quality' | 'sources'

export interface Filters {
  country: string
  language: string
  /** Minimum height in pixels; 0 means any. */
  quality: number
  categories: string[]
  hideUnmatched: boolean
  hideInsecure: boolean
  hideGeoBlocked: boolean
  hidePartTime: boolean
}

export const BLANK_FILTERS: Filters = {
  country: '',
  language: '',
  quality: 0,
  categories: [],
  hideUnmatched: false,
  hideInsecure: false,
  hideGeoBlocked: false,
  hidePartTime: false,
}
