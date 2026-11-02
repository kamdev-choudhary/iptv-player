import { z } from 'zod'

/**
 * Why a source did not play. The API's health prober and the browser player
 * both reduce their failures to one of these, so a reason recorded server-side
 * and one observed client-side mean the same thing and read the same way.
 */
export const HEALTH_REASONS = [
  'ok',
  'cors',
  'insecure',
  'headers',
  'dash',
  'gone',
  'forbidden',
  'timeout',
  'notstream',
  'network',
  'media',
  'unsupported',
] as const

export const healthReason = z.enum(HEALTH_REASONS)
export type HealthReason = z.infer<typeof healthReason>

/** Human copy for every reason, so the client and admin UI agree. */
export const REASON_COPY: Record<HealthReason, { head: string; body: string }> = {
  ok: {
    head: 'Live',
    body: 'The last probe reached this source and read a playlist from it.',
  },
  cors: {
    head: 'Broadcaster refused the browser',
    body: 'The server is up but will not let another site read it. Playing through the proxy gets around this.',
  },
  insecure: {
    head: 'Blocked by the browser',
    body: 'This source is plain http and an https page may not fetch it. The proxy serves it over https.',
  },
  headers: {
    head: 'Needs a desktop player',
    body: 'This source only answers requests carrying a specific User-Agent or Referer, which a browser may not set. The proxy sets them server-side.',
  },
  dash: {
    head: 'Format not supported',
    body: 'This is an MPEG-DASH stream. Tuner plays HLS.',
  },
  gone: {
    head: 'Source is gone',
    body: 'The server answered, but there is nothing at this address any more.',
  },
  forbidden: {
    head: 'Not available here',
    body: 'The server refused the request, usually because the channel is limited to another country.',
  },
  timeout: {
    head: 'No response',
    body: 'The server took too long to send anything back.',
  },
  notstream: {
    head: 'Not a stream any more',
    body: 'The address answered with something that is not a playlist.',
  },
  network: {
    head: 'Source is not responding',
    body: 'The stream could not be reached. It may be offline or briefly overloaded.',
  },
  media: {
    head: 'Stream is unreadable',
    body: 'Video arrived but could not be decoded, usually a codec the browser does not ship.',
  },
  unsupported: {
    head: 'Playback unavailable',
    body: 'This browser cannot play HLS.',
  },
}

/**
 * How the client should fetch a source. `proxy` means a direct fetch is known
 * to be impossible from a browser — plain http on an https page, or headers
 * JavaScript is forbidden to set — so the client goes straight through the API
 * rather than spending a failed attempt discovering it.
 */
export const playMode = z.enum(['direct', 'proxy'])
export type PlayMode = z.infer<typeof playMode>

/** Where a row came from. Upstream sync only ever rewrites its own rows. */
export const origin = z.enum(['iptv-org', 'manual', 'm3u'])
export type Origin = z.infer<typeof origin>

export const channelId = z.string().min(1).max(128)
export const sourceId = z.number().int().positive()

/** An https or http URL. Anything else is not a stream we can fetch. */
export const streamUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v), { error: 'Must be an http or https URL' })

export const isoDate = z.iso.datetime({ offset: true })

/** A paginated response. `nextCursor` is opaque — pass it back verbatim. */
export function page<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  })
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
  total: number
}
