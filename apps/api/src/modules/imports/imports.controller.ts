import type { FastifyRequest } from 'fastify'
import type { M3uImport, XtreamImport } from '@tuner/shared'
import * as service from './imports.service.ts'

export async function m3u(request: FastifyRequest<{ Body: M3uImport }>) {
  return service.importM3u(request.body)
}

export async function xtream(request: FastifyRequest<{ Body: XtreamImport }>) {
  return service.importXtream(request.body)
}
