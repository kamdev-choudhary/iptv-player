import { z } from 'zod'
import {
  channelId,
  healthReason,
  isoDate,
  origin,
  page,
  playMode,
  sourceId,
  streamUrl,
} from './primitives.ts'

/** The last probe result for one source, as the API reports it. */
export const sourceHealth = z.object({
  ok: z.boolean(),
  checkedAt: isoDate,
  reason: healthReason,
  status: z.number().int().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  /** Resolution read out of the manifest, which beats the published label. */
  height: z.number().int().positive().nullable(),
  /** Whether the origin sent an `Access-Control-Allow-Origin` a browser accepts. */
  cors: z.boolean().nullable(),
  /** Consecutive failures; drives ranking and eventual retirement. */
  failures: z.number().int().nonnegative(),
})
export type SourceHealth = z.infer<typeof sourceHealth>

export const apiSource = z.object({
  id: sourceId,
  url: streamUrl,
  /** Published quality label, e.g. `"1080p"`. */
  quality: z.string().nullable(),
  /** Best known height: probed if available, else parsed from `quality`. */
  height: z.number().int().positive().nullable(),
  /** Feed name when this is not the channel's main feed. */
  feed: z.string().nullable(),
  /** Upstream labels, e.g. `"Geo-blocked"`, `"Not 24/7"`. */
  labels: z.array(z.string()),
  play: playMode,
  insecure: z.boolean(),
  needsHeaders: z.boolean(),
  dash: z.boolean(),
  /** API path that proxies this source. Always usable as a fallback. */
  proxyPath: z.string(),
  health: sourceHealth.nullable(),
})
export type ApiSource = z.infer<typeof apiSource>

/** A row in the lineup. Everything the list renders, and nothing more. */
export const apiChannel = z.object({
  id: channelId,
  name: z.string(),
  altNames: z.array(z.string()),
  country: z.string().nullable(),
  categories: z.array(z.string()),
  languages: z.array(z.string()),
  logo: z.string().nullable(),
  website: z.string().nullable(),
  origin,
  sourceCount: z.number().int().nonnegative(),
  /** Sources whose last probe passed. Zero means nothing here plays today. */
  liveCount: z.number().int().nonnegative(),
  /** Sources a browser can reach directly or through the proxy. */
  playableCount: z.number().int().nonnegative(),
  bestHeight: z.number().int().positive().nullable(),
})
export type ApiChannel = z.infer<typeof apiChannel>

export const channelDetail = apiChannel.extend({
  sources: z.array(apiSource),
})
export type ChannelDetail = z.infer<typeof channelDetail>

export const channelPage = page(apiChannel)
export type ChannelPage = z.infer<typeof channelPage>

export const SORT_KEYS = ['name', 'quality', 'sources', 'live'] as const
export const sortKey = z.enum(SORT_KEYS)
export type SortKey = z.infer<typeof sortKey>

/**
 * The lineup query. Filtering happens in Postgres rather than over an index
 * shipped to the browser, so the catalog can grow past what a tab can hold.
 */
export const channelQuery = z.object({
  q: z.string().trim().max(128).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  language: z.string().min(2).max(3).optional(),
  /** Repeatable; a channel matches if it carries any of them. */
  category: z.array(z.string().max(64)).max(16).optional(),
  minHeight: z.coerce.number().int().min(0).max(4320).optional(),
  /** Only channels with at least one source whose last probe passed. */
  liveOnly: z.stringbool().optional(),
  /** Only channels a browser can play, directly or proxied. */
  playableOnly: z.stringbool().optional(),
  /** Drop channels upstream has not matched to a real broadcaster. */
  matchedOnly: z.stringbool().optional(),
  sort: sortKey.default('name'),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  cursor: z.string().max(256).optional(),
})
export type ChannelQuery = z.infer<typeof channelQuery>

/** Hydrating favourites and history: ids the client already holds. */
export const channelsByIdQuery = z.object({
  ids: z.array(channelId).min(1).max(200),
})
export type ChannelsByIdQuery = z.infer<typeof channelsByIdQuery>

/** One value of a filterable field, with how many channels carry it. */
export const facet = z.object({
  code: z.string(),
  name: z.string(),
  /** Country flag emoji, where there is one. */
  extra: z.string().nullable(),
  count: z.number().int().nonnegative(),
})
export type Facet = z.infer<typeof facet>

export const facets = z.object({
  countries: z.array(facet),
  categories: z.array(facet),
  languages: z.array(facet),
  channelCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  liveSourceCount: z.number().int().nonnegative(),
  /** When the catalog last changed, for cache keys and an "as of" line. */
  updatedAt: isoDate.nullable(),
  lastHealthCheckAt: isoDate.nullable(),
})
export type Facets = z.infer<typeof facets>
