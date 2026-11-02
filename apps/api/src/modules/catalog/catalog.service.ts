import type { ApiChannel, ChannelDetail, ChannelQuery, Facets, Page } from '@tuner/shared'
import { NotFoundError } from '../../core/errors.ts'
import * as repository from './catalog.repository.ts'

/**
 * The read side of the catalog.
 *
 * Thin on purpose. The interesting work — the filter predicates, the keyset
 * cursor, the source ranking — is SQL, and SQL belongs in the repository. What
 * lives here is the module's public surface: the shapes other modules and the
 * controller are allowed to depend on, and the one rule that is not a query
 * (a missing channel is a 404, not an empty result).
 */

export const listChannels = (query: ChannelQuery): Promise<Page<ApiChannel>> =>
  repository.listChannels(query)

export const channelsByIds = (ids: readonly string[]): Promise<ApiChannel[]> =>
  repository.channelsByIds(ids)

export const facets = (): Promise<Facets> => repository.facets()

export async function channelDetail(id: string): Promise<ChannelDetail> {
  const channel = await repository.channelDetail(id)
  if (!channel) throw new NotFoundError(`channel ${id}`)
  return channel
}

/**
 * How long a lineup response may be reused. The catalog changes when a sync or
 * a probe sweep lands, not per request, so a short shared cache absorbs a room
 * full of clients opening the same page.
 */
export const CACHE = {
  lineup: 'public, max-age=30, stale-while-revalidate=120',
  facets: 'public, max-age=300, stale-while-revalidate=600',
} as const
