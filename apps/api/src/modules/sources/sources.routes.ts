import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  apiSource,
  channelDetail,
  channelId,
  channelInput,
  channelPatch,
  probeRequest,
  probeResult,
  sourceId,
  sourceInput,
  sourcePatch,
} from '@tuner/shared'
import * as controller from './sources.controller.ts'

/**
 * The reason this project stopped being a static site: a stream address can be
 * corrected here and takes effect on the next request. Every write leaves the
 * row `locked`, so tonight's upstream sync reads past it rather than over it.
 */

const ok = z.object({ ok: z.literal(true) })
const errorBody = z.object({ error: z.string() })
const byChannel = z.object({ id: channelId })
const bySource = z.object({ id: z.coerce.number().int().positive() })
const channelRef = z.object({ channelId: z.string() })

export const sourcesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.put(
    '/channels',
    {
      schema: {
        operationId: 'adminUpsertChannel',
        description: 'Create or replace a hand-maintained channel, with its sources.',
        body: channelInput,
        response: { 200: channelDetail, 404: errorBody },
      },
    },
    controller.upsertChannel,
  )

  app.patch(
    '/channels/:id',
    {
      schema: {
        operationId: 'adminPatchChannel',
        description: 'Change selected fields on a channel. Survives upstream sync.',
        params: byChannel,
        body: channelPatch,
        response: { 200: z.union([channelDetail, ok]), 404: errorBody },
      },
    },
    controller.patchChannel,
  )

  app.delete(
    '/channels/:id',
    {
      schema: {
        operationId: 'adminDeleteChannel',
        params: byChannel,
        response: { 200: ok, 404: errorBody },
      },
    },
    controller.deleteChannel,
  )

  app.get(
    '/channels/:id/sources',
    {
      schema: {
        operationId: 'adminListSources',
        description: 'Every source for a channel, enabled or not.',
        params: byChannel,
        response: { 200: z.object({ items: z.array(apiSource) }) },
      },
    },
    controller.listSources,
  )

  app.post(
    '/channels/:id/sources',
    {
      schema: {
        operationId: 'adminAddSource',
        description: 'Add a stream address to a channel. Live on the next request.',
        params: byChannel,
        body: sourceInput,
        response: { 201: z.object({ id: sourceId }), 404: errorBody },
      },
    },
    controller.addSource,
  )

  app.patch(
    '/sources/:id',
    {
      schema: {
        operationId: 'adminPatchSource',
        description: 'Change a stream address or its headers. No rebuild, no deploy.',
        params: bySource,
        body: sourcePatch,
        response: { 200: channelRef, 404: errorBody },
      },
    },
    controller.patchSource,
  )

  app.delete(
    '/sources/:id',
    {
      schema: {
        operationId: 'adminDeleteSource',
        description: 'Remove a source. Upstream rows are disabled rather than deleted.',
        params: bySource,
        response: { 200: channelRef, 404: errorBody },
      },
    },
    controller.deleteSource,
  )

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
    controller.probe,
  )
}
