import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  channelDetail as channelDetailSchema,
  channelId,
  channelPage,
  channelQuery,
  channelsByIdQuery,
  facets as facetsSchema,
  apiChannel,
} from '@tuner/shared'
import { channelDetail, channelsByIds, facets, listChannels } from '../services/catalog.ts'

/**
 * The read API. Filtering and paging happen in Postgres rather than over an
 * index shipped to the browser, which is what lets the catalog grow past what
 * a tab can hold — and what lets a correction show up on the next request
 * instead of the next deploy.
 */
export const catalogRoutes: FastifyPluginAsyncZod = async (app) => {
  // The lineup changes when a sync or a probe sweep lands, not per request, so
  // a short shared cache absorbs a room full of clients opening the same page.
  const listCache = 'public, max-age=30, stale-while-revalidate=120'

  app.get(
    '/facets',
    {
      schema: {
        operationId: 'facets',
        description: 'Filterable values with channel counts, plus catalog totals.',
        response: { 200: facetsSchema },
      },
    },
    async (_req, reply) => {
      reply.header('cache-control', 'public, max-age=300, stale-while-revalidate=600')
      return facets()
    },
  )

  app.get(
    '/channels',
    {
      schema: {
        operationId: 'listChannels',
        description: 'The lineup, filtered and paged.',
        querystring: channelQuery,
        response: { 200: channelPage },
      },
    },
    async (req, reply) => {
      reply.header('cache-control', listCache)
      return listChannels(req.query)
    },
  )

  /**
   * Favourites and history live in the client, which holds ids and needs the
   * rows behind them. A POST because the list can be long enough to make a
   * querystring the wrong tool.
   */
  app.post(
    '/channels/by-ids',
    {
      schema: {
        operationId: 'channelsByIds',
        description: 'Resolve a list of channel ids, in the order given.',
        body: channelsByIdQuery,
        response: { 200: z.object({ items: z.array(apiChannel) }) },
      },
    },
    async (req) => ({ items: await channelsByIds(req.body.ids) }),
  )

  app.get(
    '/channels/:id',
    {
      schema: {
        operationId: 'channelDetail',
        description: 'One channel with its playable sources, best first.',
        params: z.object({ id: channelId }),
        response: {
          200: channelDetailSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const channel = await channelDetail(req.params.id)
      if (!channel) return reply.code(404).send({ error: 'No such channel' })
      reply.header('cache-control', listCache)
      return channel
    },
  )
}
