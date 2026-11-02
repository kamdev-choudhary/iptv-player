import type { FastifyReply, FastifyRequest } from 'fastify'
import type {
  ChannelInput,
  ChannelPatch,
  ProbeRequest,
  SourceInput,
  SourcePatch,
} from '@tuner/shared'
import { adminSources, channelDetail } from '../catalog/catalog.repository.ts'
import { NotFoundError } from '../../core/errors.ts'
import { probeSource } from './sources.probe.ts'
import * as service from './sources.service.ts'

/**
 * The write surface, as HTTP. Each handler returns the row it changed, so a
 * client never has to guess what the write did.
 */

export async function upsertChannel(request: FastifyRequest<{ Body: ChannelInput }>) {
  await service.upsertChannel(request.body)
  const channel = await channelDetail(request.body.id)
  if (!channel) throw new NotFoundError(`channel ${request.body.id}`)
  return channel
}

export async function patchChannel(
  request: FastifyRequest<{ Params: { id: string }; Body: ChannelPatch }>,
) {
  await service.patchChannel(request.params.id, request.body)
  // Patching `hidden: true` takes the channel out of the read view, so the
  // write succeeds with nothing left to return.
  return (await channelDetail(request.params.id)) ?? { ok: true as const }
}

export async function deleteChannel(request: FastifyRequest<{ Params: { id: string } }>) {
  await service.deleteChannel(request.params.id)
  return { ok: true as const }
}

/** Every source, enabled or not — the read API only shows the playable ones. */
export async function listSources(request: FastifyRequest<{ Params: { id: string } }>) {
  return { items: await adminSources(request.params.id) }
}

export async function addSource(
  request: FastifyRequest<{ Params: { id: string }; Body: SourceInput }>,
  reply: FastifyReply,
) {
  const id = await service.addSource(request.params.id, request.body)
  return reply.code(201).send({ id })
}

export async function patchSource(
  request: FastifyRequest<{ Params: { id: number }; Body: SourcePatch }>,
) {
  return { channelId: await service.patchSource(request.params.id, request.body) }
}

export async function deleteSource(request: FastifyRequest<{ Params: { id: number } }>) {
  return { channelId: await service.deleteSource(request.params.id) }
}

/**
 * Try an address before committing to it. Saves an operator from storing a URL
 * and waiting for the next sweep to find out it was wrong.
 */
export async function probe(request: FastifyRequest<{ Body: ProbeRequest }>) {
  return probeSource({
    url: request.body.url,
    userAgent: request.body.userAgent,
    referrer: request.body.referrer,
    deep: true,
  })
}
