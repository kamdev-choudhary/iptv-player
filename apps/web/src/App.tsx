import { useCallback, useMemo, useRef, useState } from 'react'
import type { ApiChannel } from '@tuner/shared'
import { FilterSheet, type LibraryView } from '@/components/filter-sheet.tsx'
import { Lineup } from '@/components/lineup.tsx'
import { SettingsDialog } from '@/components/settings-dialog.tsx'
import { Stage } from '@/components/stage.tsx'
import { TopBar } from '@/components/top-bar.tsx'
import { useChannel, useChannelsByIds, useFacets, useLineup } from '@/api/hooks.ts'
import { useDebounced } from '@/hooks/use-debounced.ts'
import { useHotkeys } from '@/hooks/use-hotkeys.ts'
import { usePlayback } from '@/hooks/use-playback.ts'
import { activeFilterCount, prefs, usePrefs } from '@/lib/prefs.ts'

/** The deep link, read once at startup: `#c=<channel-id>`. */
function channelFromHash(): string | null {
  const match = /^#c=(.+)$/.exec(window.location.hash)
  return match ? decodeURIComponent(match[1]!) : null
}

export default function App() {
  const settings = usePrefs()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<LibraryView>('all')
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
  const activeList = view === 'all' ? lineup : view === 'starred' ? starred : recent

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
          else if (filtersOpen) setFiltersOpen(false)
          else if (document.activeElement === searchRef.current) searchRef.current?.blur()
        },
        ' ': playback.togglePlay,
        m: playback.toggleMute,
        f: fullscreen,
        p: playback.togglePictureInPicture,
        n: playback.nextSource,
        s: () => setSettingsOpen((wasOpen) => !wasOpen),
      }),
      [
        settingsOpen,
        filtersOpen,
        fullscreen,
        playback.togglePlay,
        playback.toggleMute,
        playback.togglePictureInPicture,
        playback.nextSource,
      ],
    ),
  )

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <TopBar
        searchRef={searchRef}
        search={search}
        onSearch={setSearch}
        activeFilters={activeFilterCount(settings.filters)}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex flex-1 flex-col gap-3 px-3 pb-3 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-4 lg:px-4 lg:pb-4">
        <div ref={stageRef} className="lg:min-h-0">
          <Stage {...playback} channel={channel.data ?? null} onFullscreen={fullscreen} />
        </div>

        <div
          id="lineup"
          className="overflow-hidden rounded-xl border bg-card lg:flex lg:min-h-0 lg:flex-col"
        >
          <Lineup
            channels={channels}
            facets={facets.data}
            tunedId={tunedId}
            favorites={settings.favorites}
            loading={activeList.isLoading}
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

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={settings.filters}
        sort={settings.sort}
        facets={facets.data}
        view={view}
        starredCount={settings.favorites.length}
        recentCount={settings.recent.length}
        onView={setView}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        channel={channel.data ?? null}
      />
    </div>
  )
}
