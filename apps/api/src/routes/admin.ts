import { timingSafeEqual } from 'node:crypto'
import type { FastifyError } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  apiSource,
  channelDetail as channelDetailSchema,
  channelId,
  channelInput,
  channelPatch,
  healthRunOptions,
  jobRun,
  m3uImport,
  probeRequest,
  probeResult,
  sourceId as sourceIdSchema,
  sourceInput,
  sourcePatch,
  xtreamImport,
} from '@tuner/shared'
import { env } from '../env.ts'
import { adminSources, channelDetail } from '../services/catalog.ts'
import { runHealthSweep } from '../services/health.ts'
import { JobBusyError, recentJobRuns, runJob } from '../services/jobs.ts'
import { probeSource } from '../services/probe.ts'
import { runSync } from '../services/sync.ts'
import {
  NotFoundError,
  addSource,
  deleteChannel,
  deleteSource,
  importM3u,
  importXtream,
  patchChannel,
  patchSource,
  upsertChannel,
} from '../services/writes.ts'

/**
 * The write API — the answer to "change a stream address without a deploy".
 *
 * Every route here leaves the row `locked`, so tonight's upstream sync reads
 * past it rather than over it. That is the difference between this and the
 * build-time index it replaces: the catalog is data now, and data can be
 * corrected while the thing is running.
 */

const ok = z.object({ ok: z.literal(true) })
const errorBody = z.object({ error: z.string() })

function tokenMatches(given: string, expected: string) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * No token configured means no admin API. Defaulting to open would be the
   * kind of convenience that ends with someone else's playlist in the database.
   */
  app.addHook('onRequest', async (req, reply) => {
    if (!env.ADMIN_TOKEN) {
      return reply.code(503).send({ error: 'Admin API is disabled: ADMIN_TOKEN is not set' })
    }
    const given = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
    if (!given || !tokenMatches(given, env.ADMIN_TOKEN)) {
      return reply.code(401).send({ error: 'Bad or missing admin token' })
    }
  })

  // Admin responses are per-operator and never worth storing anywhere.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('cache-control', 'no-store')
  })

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message })
    if (err instanceof JobBusyError) return reply.code(409).send({ error: err.message })
    if (err.validation) return reply.code(400).send({ error: err.message })
    app.log.error({ err }, 'admin request failed')
    return reply.code(500).send({ error: err.message })
  })

  // ─── Channels ──────────────────────────────────────────────────────────────

  app.put(
    '/channels',
    {
      schema: {
        operationId: 'adminUpsertChannel',
        description: 'Create or replace a hand-maintained channel, with its sources.',
        body: channelInput,
        response: { 200: channelDetailSchema, 404: errorBody },
      },
    },
    async (req, reply) => {
      await upsertChannel(req.body)
      const channel = await channelDetail(req.body.id)
      if (!channel) return reply.code(404).send({ error: 'Channel vanished after write' })
      return channel
    },
  )

  app.patch(
    '/channels/:id',
    {
      schema: {
        operationId: 'adminPatchChannel',
        description: 'Change selected fields on a channel. Survives upstream sync.',
        params: z.object({ id: channelId }),
        body: channelPatch,
        // Patching `hidden: true` takes the channel out of the read view, so
        // the write succeeds with nothing left to return.
        response: { 200: z.union([channelDetailSchema, ok]), 404: errorBody },
      },
    },
    async (req) => {
      await patchChannel(req.params.id, req.body)
      return (await channelDetail(req.params.id)) ?? { ok: true as const }
    },
  )

  app.delete(
    '/channels/:id',
    {
      schema: {
        operationId: 'adminDeleteChannel',
        params: z.object({ id: channelId }),
        response: { 200: ok, 404: errorBody },
      },
    },
    async (req) => {
      await deleteChannel(req.params.id)
      return { ok: true as const }
    },
  )

  // ─── Sources ───────────────────────────────────────────────────────────────

  /** Every source, enabled or not — the read API only shows the playable ones. */
  app.get(
    '/channels/:id/sources',
    {
      schema: {
        operationId: 'adminListSources',
        params: z.object({ id: channelId }),
        response: { 200: z.object({ items: z.array(apiSource) }) },
      },
    },
    async (req) => ({ items: await adminSources(req.params.id) }),
  )

  app.post(
    '/channels/:id/sources',
    {
      schema: {
        operationId: 'adminAddSource',
        description: 'Add a stream address to a channel. Live on the next request.',
        params: z.object({ id: channelId }),
        body: sourceInput,
        response: { 201: z.object({ id: sourceIdSchema }), 404: errorBody },
      },
    },
    async (req, reply) => {
      const id = await addSource(req.params.id, req.body)
      return reply.code(201).send({ id })
    },
  )

  app.patch(
    '/sources/:id',
    {
      schema: {
        operationId: 'adminPatchSource',
        description: 'Change a stream address or its headers. No rebuild, no deploy.',
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: sourcePatch,
        response: { 200: z.object({ channelId: z.string() }), 404: errorBody },
      },
    },
    async (req) => ({ channelId: await patchSource(req.params.id, req.body) }),
  )

  app.delete(
    '/sources/:id',
    {
      schema: {
        operationId: 'adminDeleteSource',
        description: 'Remove a source. Upstream rows are disabled rather than deleted.',
        params: z.object({ id: z.coerce.number().int().positive() }),
        response: { 200: z.object({ channelId: z.string() }), 404: errorBody },
      },
    },
    async (req) => ({ channelId: await deleteSource(req.params.id) }),
  )

  /**
   * Try an address before committing to it. Saves an operator from storing a
   * URL and waiting for the next sweep to find out it was wrong.
   */
  app.post(
    '/probe',
    {
      schema: {
        operationId: 'adminProbe',
        description: 'Fetch a stream address now and report what came back.',
        body: probeRequest,
        response: { 200: probeResult },
      },
    },
    async (req) =>
      probeSource({
        url: req.body.url,
        userAgent: req.body.userAgent,
        referrer: req.body.referrer,
        deep: true,
      }),
  )

  // ─── Imports ───────────────────────────────────────────────────────────────

  const importStats = z.object({
    channels: z.number().int(),
    sources: z.number().int(),
    removedChannels: z.number().int(),
    removedSources: z.number().int(),
  })

  app.post(
    '/import/m3u',
    {
      schema: {
        operationId: 'adminImportM3u',
        description: 'Import a playlist by URL or pasted body into its own namespace.',
        body: m3uImport,
        response: { 200: importStats },
      },
    },
    async (req) => importM3u(req.body),
  )

  app.post(
    '/import/xtream',
    {
      schema: {
        operationId: 'adminImportXtream',
        description: 'Import an Xtream Codes portal, which publishes its lineup as M3U.',
        body: xtreamImport,
        response: { 200: importStats },
      },
    },
    async (req) => importXtream(req.body),
  )

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  app.get(
    '/jobs',
    {
      schema: {
        operationId: 'adminJobRuns',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }),
        response: { 200: z.object({ items: z.array(jobRun) }) },
      },
    },
    async (req) => ({ items: await recentJobRuns(req.query.limit) }),
  )

  app.post(
    '/jobs/sync',
    {
      schema: {
        operationId: 'adminRunSync',
        description: 'Pull iptv-org now. Locked rows are left alone.',
        response: { 200: jobRun, 409: errorBody },
      },
    },
    async () => runJob('sync', (log) => runSync(log)),
  )

  app.post(
    '/jobs/health',
    {
      schema: {
        operationId: 'adminRunHealth',
        description: 'Probe stale sources now and re-rank the lineup.',
        body: healthRunOptions.partial().default({}),
        response: { 200: jobRun, 409: errorBody },
      },
    },
    async (req) => {
      const opts = healthRunOptions.parse(req.body ?? {})
      return runJob('health', (log) => runHealthSweep(opts, log))
    },
  )
}
