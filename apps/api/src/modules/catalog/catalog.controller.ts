import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ChannelQuery } from '@tuner/shared'
import * as service from './catalog.service.ts'

/**
 * HTTP in, HTTP out. Each handler reads an already-validated request, calls the
 * service and sets the response's cache policy — and contains no rule that
 * would still be true if this were a CLI.
 */

export async function facets(_request: FastifyRequest, reply: FastifyReply) {
  reply.header('cache-control', service.CACHE.facets)
  return service.facets()
}

export async function listChannels(
  request: FastifyRequest<{ Querystring: ChannelQuery }>,
  reply: FastifyReply,
) {
  reply.header('cache-control', service.CACHE.lineup)
  return service.listChannels(request.query)
}

export async function channelsByIds(request: FastifyRequest<{ Body: { ids: string[] } }>) {
  return { items: await service.channelsByIds(request.body.ids) }
}

export async function channelDetail(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  reply.header('cache-control', service.CACHE.lineup)
  return service.channelDetail(request.params.id)
}
