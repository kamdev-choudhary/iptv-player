import { z } from 'zod'
import { channelId, healthReason, isoDate, streamUrl } from './primitives.ts'
import { apiSource, channelDetail } from './catalog.ts'

/**
 * The write surface. Every field here is editable at runtime, which is the
 * point of the move off a build-time index: a stream address changes, you
 * patch it, and the next request serves the new one. No rebuild, no deploy.
 */

const headerValue = z.string().trim().max(512)

export const sourceInput = z.object({
  url: streamUrl,
  quality: z.string().trim().max(32).nullish(),
  feed: z.string().trim().max(128).nullish(),
  labels: z.array(z.string().trim().max(64)).max(16).optional(),
  /** Sent upstream by the proxy. A browser cannot set either itself. */
  userAgent: headerValue.nullish(),
  referrer: headerValue.nullish(),
  enabled: z.boolean().optional(),
})
export type SourceInput = z.infer<typeof sourceInput>

export const sourcePatch = sourceInput.partial()
export type SourcePatch = z.infer<typeof sourcePatch>

export const channelInput = z.object({
  id: channelId,
  name: z.string().trim().min(1).max(256),
  altNames: z.array(z.string().trim().max(256)).max(8).optional(),
  country: z.string().trim().length(2).toUpperCase().nullish(),
  categories: z.array(z.string().trim().max(64)).max(16).optional(),
  languages: z.array(z.string().trim().min(2).max(3)).max(8).optional(),
  logo: z.string().trim().max(2048).nullish(),
  website: z.string().trim().max(2048).nullish(),
  hidden: z.boolean().optional(),
  sources: z.array(sourceInput).max(64).optional(),
})
export type ChannelInput = z.infer<typeof channelInput>

export const channelPatch = channelInput.omit({ id: true, sources: true }).partial()
export type ChannelPatch = z.infer<typeof channelPatch>

/** Import an M3U playlist by URL or by pasted body. */
export const m3uImport = z
  .object({
    url: z.string().trim().max(2048).optional(),
    body: z.string().max(8_000_000).optional(),
    /** Prefix for generated channel ids, keeping an import separable. */
    namespace: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[a-z0-9][a-z0-9-]*$/, { error: 'Lowercase letters, digits and dashes only' }),
    /** Replace everything previously imported under this namespace. */
    replace: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.url) !== Boolean(v.body), {
    error: 'Provide exactly one of url or body',
  })
export type M3uImport = z.infer<typeof m3uImport>

/** Xtream Codes portals expose their lineup as an M3U, so this normalises to one. */
export const xtreamImport = z.object({
  host: z.string().trim().min(1).max(512),
  username: z.string().trim().min(1).max(256),
  password: z.string().trim().min(1).max(256),
  namespace: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9][a-z0-9-]*$/, { error: 'Lowercase letters, digits and dashes only' }),
  replace: z.boolean().default(false),
})
export type XtreamImport = z.infer<typeof xtreamImport>

/** Probe one source now and report what happened, without storing a guess. */
export const probeResult = z.object({
  ok: z.boolean(),
  reason: healthReason,
  status: z.number().int().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  height: z.number().int().positive().nullable(),
  cors: z.boolean().nullable(),
  /** Variant playlists found, so an operator can see what they are adding. */
  variants: z.array(z.object({ height: z.number().int().nullable(), bandwidth: z.number().int().nullable() })),
})
export type ProbeResult = z.infer<typeof probeResult>

export const probeRequest = z.object({
  url: streamUrl,
  userAgent: headerValue.nullish(),
  referrer: headerValue.nullish(),
})
export type ProbeRequest = z.infer<typeof probeRequest>

export const JOB_NAMES = ['sync', 'health'] as const
export const jobName = z.enum(JOB_NAMES)
export type JobName = z.infer<typeof jobName>

export const jobRun = z.object({
  id: z.number().int(),
  job: jobName,
  status: z.enum(['running', 'ok', 'failed']),
  startedAt: isoDate,
  finishedAt: isoDate.nullable(),
  stats: z.record(z.string(), z.number()).nullable(),
  error: z.string().nullable(),
})
export type JobRun = z.infer<typeof jobRun>

export const healthRunOptions = z.object({
  /** Re-probe sources last checked longer ago than this. */
  staleHours: z.coerce.number().int().min(0).max(720).default(6),
  limit: z.coerce.number().int().min(1).max(100_000).default(5_000),
  concurrency: z.coerce.number().int().min(1).max(128).default(24),
})
export type HealthRunOptions = z.infer<typeof healthRunOptions>

export const adminSourceList = z.object({ items: z.array(apiSource) })
export const adminChannelResult = channelDetail
