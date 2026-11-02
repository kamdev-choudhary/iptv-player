import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  apiChannel,
  channelDetail,
  channelId,
  channelPage,
  channelQuery,
  channelsByIdQuery,
  facets,
} from '@tuner/shared'
import * as controller from './catalog.controller.ts'

/**
 * The read API. Filtering and paging happen in Postgres rather than over an
 * index shipped to the browser, which is what lets the catalog grow past what
 * a tab can hold — and what lets a correction show up on the next request
 * instead of the next deploy.
 */
export const catalogRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/facets',
    {
      schema: {
        operationId: 'facets',
        description: 'Filterable values with channel counts, plus catalog totals.',
        response: { 200: facets },
      },
    },
    controller.facets,
  )

  app.get(
    '/channels',
    {
      schema: {
        operationId: 'listChannels',
        description: 'The channel list, filtered and paged.',
        querystring: channelQuery,
        response: { 200: channelPage },
      },
    },
    controller.listChannels,
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
    controller.channelsByIds,
  )

  app.get(
    '/channels/:id',
    {
      schema: {
        operationId: 'channelDetail',
        description: 'One channel with its playable sources, best first.',
        params: z.object({ id: channelId }),
        response: { 200: channelDetail, 404: z.object({ error: z.string() }) },
      },
    },
    controller.channelDetail,
  )
}
