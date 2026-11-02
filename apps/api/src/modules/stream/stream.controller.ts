import type { FastifyReply, FastifyRequest } from 'fastify'
import { decodeUrl, verify } from './stream.sign.ts'
import * as service from './stream.service.ts'

/**
 * HTTP for the proxy. The one thing here that is not plumbing is the abort
 * signal: it has to be tied to the *response* closing, not the request. For a
 * GET the request completes the moment the headers arrive, long before there
 * is anything to send.
 */

function clientGone(reply: FastifyReply): AbortSignal {
  const controller = new AbortController()
  reply.raw.on('close', () => controller.abort())
  return controller.signal
}

const refuse = (reply: FastifyReply, code: number, message: string) =>
  reply.code(code).type('application/json').send({ error: message })

/** Sends whichever of the two shapes the service produced. */
function send(reply: FastifyReply, fetched: service.Fetched) {
  if (fetched.kind === 'manifest') {
    reply.header('cache-control', 'no-store')
    return reply.type(service.MANIFEST_TYPE).send(fetched.body)
  }

  const { response, release } = fetched
  for (const [name, value] of Object.entries(service.forwardHeaders(response))) {
    reply.header(name, value)
  }
  reply.code(response.status)

  const piped = service.toNodeStream(response, release)
  if (!piped) return reply.send()

  reply.raw.on('close', () => {
    piped.stream.destroy()
    piped.done()
  })
  return reply.send(piped.stream)
}

/** Maps the service's refusals onto responses, and nothing else. */
async function attempt(reply: FastifyReply, work: () => Promise<service.Fetched>) {
  try {
    return send(reply, await work())
  } catch (error) {
    if (error instanceof service.AbandonedError) return reply
    if (error instanceof service.UpstreamError) {
      return refuse(reply, error.status, 'Upstream refused the request')
    }
    throw error
  }
}

type Params = { Params: { id: number } }
type ChildQuery = { Querystring: { u: string; t: string } }

export async function entry(
  request: FastifyRequest<Params & { Querystring: { k?: string } }>,
  reply: FastifyReply,
) {
  if (!service.tokenAccepted(request.query.k, request.headers.authorization)) {
    return refuse(reply, 401, 'This player requires a stream token')
  }

  const source = await service.resolveSource(request.params.id)
  return attempt(reply, () => service.fetchForSource(source, source.url, clientGone(reply)))
}

/** A variant or rendition playlist discovered inside another playlist. */
export async function childManifest(
  request: FastifyRequest<Params & ChildQuery>,
  reply: FastifyReply,
) {
  const url = decodeUrl(request.query.u)
  if (!url || !verify(request.params.id, url, request.query.t)) {
    return refuse(reply, 403, 'Bad or missing signature')
  }

  const source = await service.resolveSource(request.params.id)
  return attempt(reply, () => service.fetchForSource(source, url, clientGone(reply)))
}

/** Segments, AES key blobs and initialisation segments: bytes, passed through. */
export async function segment(request: FastifyRequest<Params & ChildQuery>, reply: FastifyReply) {
  const url = decodeUrl(request.query.u)
  if (!url || !verify(request.params.id, url, request.query.t)) {
    return refuse(reply, 403, 'Bad or missing signature')
  }

  const source = await service.resolveSource(request.params.id)
  return attempt(reply, () =>
    service.fetchForSource(source, url, clientGone(reply), {
      // Seeking in a VOD asset depends on the range reaching the origin.
      range: request.headers.range ?? null,
      rewrite: false,
    }),
  )
}

export async function capacity() {
  return service.capacity()
}
