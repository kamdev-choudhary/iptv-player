import { useEffect, useState } from 'react'
import { EMPTY_CATALOG, indexForSearch, type Catalog } from '@/lib/channels'
import type { ChannelIndex, SourceIndex } from '@/lib/types'

export interface CatalogState {
  catalog: Catalog
  /** True until `channels.json` has landed, one way or the other. */
  loading: boolean
  error: string | null
}

/**
 * Loads the two data files. `channels.json` is everything the grid needs;
 * `sources.json` is three times the size and only matters once someone
 * presses play, so the grid renders without waiting for it.
 */
export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({
    catalog: EMPTY_CATALOG,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let live = true

    async function load() {
      let index: ChannelIndex
      try {
        const res = await fetch('data/channels.json')
        if (!res.ok) throw new Error(String(res.status))
        index = (await res.json()) as ChannelIndex
      } catch {
        if (live)
          setState({
            catalog: EMPTY_CATALOG,
            loading: false,
            error: 'The channel list could not be loaded. Check your connection and reload.',
          })
        return
      }
      if (!live) return

      const byId = new Map(index.channels.map((c) => [c.i, c]))
      const catalog: Catalog = { index, byId, sources: {}, sourcesReady: false }
      for (const c of index.channels) indexForSearch(c, catalog)
      setState({ catalog, loading: false, error: null })

      try {
        const res = await fetch('data/sources.json')
        const payload = (await res.json()) as SourceIndex
        if (!live) return
        // A new catalog object, so consumers see sourcesReady flip.
        setState((prev) => ({
          ...prev,
          catalog: { ...prev.catalog, sources: payload.sources, sourcesReady: true },
        }))
      } catch {
        // The grid still works; only playback needs this file.
      }
    }

    void load()
    return () => {
      live = false
    }
  }, [])

  return state
}
