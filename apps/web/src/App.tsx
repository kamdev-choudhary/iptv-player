import { useCallback, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { ApiChannel, SortKey } from '@tuner/shared'
import { ControlRail } from '@/components/control-rail.tsx'
import { FilterPanel } from '@/components/filter-panel.tsx'
import { Lineup } from '@/components/lineup.tsx'
import { SettingsDialog } from '@/components/settings-dialog.tsx'
import { Stage } from '@/components/stage.tsx'
import { useChannel, useChannelsByIds, useFacets, useLineup } from '@/api/hooks.ts'
import { useDebounced } from '@/hooks/use-debounced.ts'
import { useHotkeys } from '@/hooks/use-hotkeys.ts'
import { usePlayback } from '@/hooks/use-playback.ts'
import { usePrefs } from '@/hooks/use-prefs.ts'
import { prefs } from '@/lib/prefs.ts'

/**
 * Three panels: filters, picture, lineup.
 *
 * The picture sits in the middle because choosing what to watch should never
 * cost you sight of what you are watching — the lineup stays open beside it
 * rather than covering it. Below 1280px the panels stack and the filters fold
 * away, since there is no room for three columns and the picture wins.
 */

type View = 'all' | 'starred' | 'recent'

/** The deep link, read once at startup: `#c=<channel-id>`. */
function channelFromHash(): string | null {
  const match = /^#c=(.+)$/.exec(window.location.hash)
  return match ? decodeURIComponent(match[1]!) : null
}

export default function App() {
  const settings = usePrefs()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('all')
  const [tunedId, setTunedId] = useState<string | null>(channelFromHash)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const debouncedSearch = useDebounced(search, 220)
  const facets = useFacets()

  const lineupQuery = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      country: settings.filters.country || undefined,
      language: settings.filters.language || undefined,
      category: settings.filters.category.length ? settings.filters.category : undefined,
      minHeight: settings.filters.minHeight || undefined,
      liveOnly: settings.filters.liveOnly || undefined,
      playableOnly: settings.filters.playableOnly || undefined,
      matchedOnly: settings.filters.matchedOnly || undefined,
      sort: settings.sort,
    }),
    [debouncedSearch, settings.filters, settings.sort],
  )

  const lineup = useLineup(lineupQuery, view === 'all')
  const starred = useChannelsByIds(view === 'starred' ? settings.favorites : [])
  const recent = useChannelsByIds(view === 'recent' ? settings.recent : [])

  // One list, whichever view is showing. Starred and recent arrive already in
  // the order this browser put them in, so they are not re-sorted.
  const channels: ApiChannel[] =
    view === 'all'
      ? (lineup.data?.pages.flatMap((page) => page.items) ?? [])
      : view === 'starred'
        ? (starred.data ?? [])
        : (recent.data ?? [])

  const channel = useChannel(tunedId)

  const open = useCallback((next: ApiChannel) => {
    setTunedId(next.id)
    // A shareable link, replacing rather than stacking history entries.
    window.history.replaceState(null, '', `#c=${encodeURIComponent(next.id)}`)
  }, [])

  const playback = usePlayback({
    channel: channel.data ?? null,
    streamToken: settings.streamToken,
    autoNext: settings.autoNext,
    autoProxy: settings.autoProxy,
  })

  const fullscreen = useCallback(() => {
    const target = stageRef.current
    if (!target) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void target.requestFullscreen().catch(() => {})
  }, [])

  useHotkeys(
    useMemo(
      () => ({
        '/': () => searchRef.current?.focus(),
        escape: () => {
          if (settingsOpen) setSettingsOpen(false)
          else if (document.activeElement === searchRef.current) searchRef.current?.blur()
        },
        '': playback.togglePlay,
        m: playback.toggleMute,
        f: fullscreen,
        p: playback.togglePictureInPicture,
        n: playback.nextSource,
        s: () => setSettingsOpen((wasOpen) => !wasOpen),
      }),
      [
        settingsOpen,
        fullscreen,
        playback.togglePlay,
        playback.toggleMute,
        playback.togglePictureInPicture,
        playback.nextSource,
      ],
    ),
  )

  const activeList = view === 'all' ? lineup : view === 'starred' ? starred : recent

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ControlRail
        ref={searchRef}
        search={search}
        onSearch={setSearch}
        sort={settings.sort}
        onSort={(sort: SortKey) => prefs.set({ sort })}
        facets={facets.data}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleFilters={() => setFiltersOpen((wasOpen) => !wasOpen)}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[1fr_auto] xl:grid-cols-[232px_1fr_360px] xl:grid-rows-1">
        <div
          className={clsx(
            'min-h-0 xl:block',
            filtersOpen ? 'block border-b  xl:border-b-0' : 'hidden',
          )}
        >
          <FilterPanel
            filters={settings.filters}
            facets={facets.data}
            view={view}
            starredCount={settings.favorites.length}
            recentCount={settings.recent.length}
            onView={setView}
          />
        </div>

        <div ref={stageRef} className="min-h-0 bg-background">
          <Stage {...playback} channel={channel.data ?? null} onFullscreen={fullscreen} />
        </div>

        <div id="lineup" className="min-h-0">
          <Lineup
            channels={channels}
            facets={facets.data}
            tunedId={tunedId}
            favorites={settings.favorites}
            loading={activeList.isLoading}
            refreshing={view === 'all' && lineup.isFetching && !lineup.isFetchingNextPage}
            hasMore={view === 'all' && Boolean(lineup.hasNextPage)}
            loadingMore={view === 'all' && lineup.isFetchingNextPage}
            total={view === 'all' ? (lineup.data?.pages[0]?.total ?? 0) : channels.length}
            error={activeList.error}
            onOpen={open}
            onLoadMore={() => void lineup.fetchNextPage()}
            onClearFilters={() => {
              prefs.resetFilters()
              setSearch('')
            }}
          />
        </div>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        channel={channel.data ?? null}
      />
    </div>
  )
}
