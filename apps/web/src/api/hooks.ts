import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { z } from 'zod'
import {
  apiChannel,
  channelDetail,
  channelPage,
  facets,
  jobRun,
  probeResult,
  type ApiChannel,
  type ChannelQuery,
  type ProbeRequest,
  type SourcePatch,
} from '@tuner/shared'
import { api, query } from './client.ts'

/**
 * The lineup lives on the server now, so the client's job is to ask the right
 * question and cache the answer — not to hold eleven thousand rows and filter
 * them in a keystroke handler.
 */

export const keys = {
  facets: ['facets'] as const,
  lineup: (q: LineupQuery) => ['channels', q] as const,
  channel: (id: string) => ['channel', id] as const,
  byIds: (ids: readonly string[]) => ['channels-by-ids', ids] as const,
  jobs: ['jobs'] as const,
}

export function useFacets() {
  return useQuery({
    queryKey: keys.facets,
    queryFn: ({ signal }) => api.get('/api/facets', facets, signal),
    // Facets only move when a sync or sweep lands, which is hours apart.
    staleTime: 5 * 60_000,
  })
}

export type LineupQuery = Omit<ChannelQuery, 'cursor' | 'limit'>

export function useLineup(params: LineupQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.lineup(params),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.get(`/api/channels${query({ ...params, cursor: pageParam, limit: 60 })}`, channelPage, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // A page already fetched stays usable while the next query runs, so
    // narrowing a filter does not blank the panel.
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  })
}

export function useChannel(id: string | null) {
  return useQuery({
    queryKey: keys.channel(id ?? ''),
    enabled: Boolean(id),
    queryFn: ({ signal }) => api.get(`/api/channels/${encodeURIComponent(id!)}`, channelDetail, signal),
    // Source health is the point of asking, and it changes on every sweep.
    staleTime: 30_000,
  })
}

const byIdsResponse = z.object({ items: z.array(apiChannel) })

/** Favourites and history are ids in this browser; this resolves them to rows. */
export function useChannelsByIds(ids: readonly string[]) {
  return useQuery({
    queryKey: keys.byIds(ids),
    enabled: ids.length > 0,
    queryFn: () => api.post('/api/channels/by-ids', byIdsResponse, { ids: [...ids] }),
    select: (data): ApiChannel[] => data.items,
    staleTime: 60_000,
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

const jobsResponse = z.object({ items: z.array(jobRun) })

export function useJobRuns(token: string | null) {
  return useQuery({
    queryKey: keys.jobs,
    enabled: Boolean(token),
    queryFn: () => api.get(`/admin/jobs${query({})}`, jobsResponse),
    staleTime: 10_000,
  })
}

/** Everything the catalog shows is derived from the database, so a write
 *  invalidates the lot rather than trying to patch caches in place. */
function invalidateCatalog(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ['channels'] })
  void client.invalidateQueries({ queryKey: ['channel'] })
  void client.invalidateQueries({ queryKey: keys.facets })
}

export function useProbe(token: string | null) {
  return useMutation({
    mutationFn: (body: ProbeRequest) => api.post('/admin/probe', probeResult, body, token ?? undefined),
  })
}

const patchSourceResponse = z.object({ channelId: z.string() })

/**
 * The write this whole rebuild exists for: a stream address changes, it is
 * patched here, and the next request serves the new one.
 */
export function usePatchSource(token: string | null) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: SourcePatch }) =>
      api.patch(`/admin/sources/${id}`, patchSourceResponse, patch, token ?? undefined),
    onSuccess: () => invalidateCatalog(client),
  })
}

export function useDeleteSource(token: string | null) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/sources/${id}`, patchSourceResponse, token ?? undefined),
    onSuccess: () => invalidateCatalog(client),
  })
}

export function useAddSource(token: string | null) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ channelId, url }: { channelId: string; url: string }) =>
      api.post(
        `/admin/channels/${encodeURIComponent(channelId)}/sources`,
        z.object({ id: z.number() }),
        { url },
        token ?? undefined,
      ),
    onSuccess: () => invalidateCatalog(client),
  })
}

export function useRunJob(token: string | null) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (job: 'sync' | 'health') =>
      api.post(`/admin/jobs/${job}`, jobRun, undefined, token ?? undefined),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.jobs })
      invalidateCatalog(client)
    },
  })
}
