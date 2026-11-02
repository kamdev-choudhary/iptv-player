import type { FastifyRequest } from 'fastify'
import { healthRunOptions, type HealthRunOptions } from '@tuner/shared'
import { runHealthSweep } from './jobs.health.ts'
import { recentJobRuns, runJob } from './jobs.service.ts'
import { runSync } from './jobs.sync.ts'

export async function list(request: FastifyRequest<{ Querystring: { limit: number } }>) {
  return { items: await recentJobRuns(request.query.limit) }
}

export async function sync() {
  return runJob('sync', (log) => runSync(log))
}

export async function health(request: FastifyRequest<{ Body: Partial<HealthRunOptions> }>) {
  const options = healthRunOptions.parse(request.body ?? {})
  return runJob('health', (log) => runHealthSweep(options, log))
}
