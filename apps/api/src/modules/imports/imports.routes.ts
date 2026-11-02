import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { m3uImport, xtreamImport } from '@tuner/shared'
import * as controller from './imports.controller.ts'

const importStats = z.object({
  channels: z.number().int(),
  sources: z.number().int(),
  removedChannels: z.number().int(),
  removedSources: z.number().int(),
})

export const importsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/m3u',
    {
      schema: {
        operationId: 'adminImportM3u',
        description: 'Import a playlist by URL or pasted body into its own namespace.',
        body: m3uImport,
        response: { 200: importStats },
      },
    },
    controller.m3u,
  )

  app.post(
    '/xtream',
    {
      schema: {
        operationId: 'adminImportXtream',
        description: 'Import an Xtream Codes portal, which publishes its lineup as M3U.',
        body: xtreamImport,
        response: { 200: importStats },
      },
    },
    controller.xtream,
  )
}
