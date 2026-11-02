import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { healthRunOptions, jobRun } from '@tuner/shared'
import * as controller from './jobs.controller.ts'

/**
 * The two long jobs, on demand. Both also run on a schedule; starting one here
 * takes the same lock, so a manual run and a scheduled one cannot collide.
 */
export const jobsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      schema: {
        operationId: 'adminJobRuns',
        description: 'What ran, when, and what it did.',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }),
        response: { 200: z.object({ items: z.array(jobRun) }) },
      },
    },
    controller.list,
  )

  app.post(
    '/sync',
    {
      schema: {
        operationId: 'adminRunSync',
        description: 'Pull iptv-org now. Locked rows are left alone.',
        response: { 200: jobRun, 409: z.object({ error: z.string() }) },
      },
    },
    controller.sync,
  )

  app.post(
    '/health',
    {
      schema: {
        operationId: 'adminRunHealth',
        description: 'Probe stale sources now and re-rank the lineup.',
        body: healthRunOptions.partial().default({}),
        response: { 200: jobRun, 409: z.object({ error: z.string() }) },
      },
    },
    controller.health,
  )
}
