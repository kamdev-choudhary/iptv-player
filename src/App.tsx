import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import { ChannelGrid, GridSkeleton } from '@/components/channel-grid'
import { CommandPalette } from '@/components/command-palette'
import { PlayerStage } from '@/components/player-stage'
import { PlaylistDialog } from '@/components/playlist-dialog'
import { SettingsDialog } from '@/components/settings-dialog'
import { useCatalog } from '@/hooks/use-catalog'
import { useDebounced } from '@/hooks/use-debounced'
import { usePlayback } from '@/hooks/use-playback'
import { usePersisted } from '@/hooks/use-store'
import { activeFilterCount, indexForSearch, runQuery } from '@/lib/channels'
import { store } from '@/lib/store'
import { cn } from '@/lib/utils'
import { BLANK_FILTERS, type Channel, type Filters, type LibraryView, type SortKey } from '@/lib/types'

/** Tiles painted per scroll batch. */
const PAGE = 60

const PAGE_IS_HTTPS = location.protocol === 'https:'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'A to Z' },
  { value: 'quality', label: 'Best quality' },
  { value: 'sources', label: 'Most sources' },
]

export default function App() {
  const { catalog, loading, error } = useCatalog()
  const persisted = usePersisted()

  const [view, setView] = useState<LibraryView>('all')
  const [playlistId, setPlaylistId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  // On an https page this filter is the difference between a working list and
  // a broken one, so it starts on there.
  const [filters, setFilters] = useState<Filters>({
    ...BLANK_FILTERS,
    hideInsecure: PAGE_IS_HTTPS,
  })
  const [shown, setShown] = useState(PAGE)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [playlistOpen, setPlaylistOpen] = useState(false)

  const searchRef = useRef<HTMLInputElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const slowQuery = useDebounced(query, 140)

  const playback = usePlayback({ catalog, onNeedProxy: () => setSettingsOpen(true) })

  /* ── playlists join the lookup, so deep links and saves resolve ─────── */

  useEffect(() => {
    if (!catalog.index) return
    for (const pl of Object.values(persisted.playlists)) {
      for (const ch of pl.channels) {
        if (!catalog.byId.has(ch.i)) {
          indexForSearch(ch, catalog)
          catalog.byId.set(ch.i, ch)
        }
      }
    }
  }, [catalog, persisted.playlists])

  /* ── the query ──────────────────────────────────────────────────────── */

  const facets = useMemo(() => {
    const channels = catalog.index?.channels ?? []
    const countries = new Map<string, number>()
    const languages = new Map<string, number>()
    for (const c of channels) {
      if (c.c) countries.set(c.c, (countries.get(c.c) ?? 0) + 1)
      for (const l of c.l ?? []) languages.set(l, (languages.get(l) ?? 0) + 1)
    }
    return {
      countries: [...countries].sort((a, b) =>
        (catalog.index?.countries[a[0]]?.[0] ?? a[0]).localeCompare(
          catalog.index?.countries[b[0]]?.[0] ?? b[0],
        ),
      ),
      // Below three channels a language is noise in a list this long.
      languages: [...languages].filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]),
    }
  }, [catalog])

  const pool = useMemo(() => {
    const byId = catalog.byId
    if (view === 'favorites')
      return persisted.favorites.map((id) => byId.get(id)).filter(Boolean) as Channel[]
    if (view === 'recent')
      return persisted.recent.map((id) => byId.get(id)).filter(Boolean) as Channel[]
    if (view === 'playlist') return (playlistId && persisted.playlists[playlistId]?.channels) || []
    return catalog.index?.channels ?? []
  }, [view, playlistId, catalog, persisted.favorites, persisted.recent, persisted.playlists])

  const results = useMemo(
    () =>
      runQuery({
        pool,
        query: slowQuery,
        filters,
        sort,
        catalog,
        // Saved and recent are already in a meaningful order; leave it be.
        preserveOrder: view === 'favorites' || view === 'recent',
      }),
    [pool, slowQuery, filters, sort, catalog, view],
  )

  useEffect(() => setShown(PAGE), [results])

  const recentChannels = useMemo(
    () => persisted.recent.map((id) => catalog.byId.get(id)).filter(Boolean) as Channel[],
    [persisted.recent, catalog],
  )

  /* ── actions ────────────────────────────────────────────────────────── */

  const play = useCallback(
    (ch: Channel) => {
      playback.open(ch)
      history.replaceState(null, '', `#c=${encodeURIComponent(ch.i)}`)
      document.title = `${ch.n} — Tuner`
      stageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    },
    [playback],
  )

  const selectView = useCallback((next: LibraryView, playlist: string | null = null) => {
    setView(next)
    setPlaylistId(playlist)
  }, [])

  const changeFilters = useCallback(
    (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })),
    [],
  )

  const resetFilters = useCallback(() => {
    setFilters({ ...BLANK_FILTERS, hideInsecure: filters.hideInsecure })
    setQuery('')
  }, [filters.hideInsecure])

  const adoptPlaylist = useCallback(
    (name: string, channels: Channel[]) => {
      const id = store.addPlaylist(name, channels)
      for (const ch of channels) {
        indexForSearch(ch, catalog)
        catalog.byId.set(ch.i, ch)
      }
      selectView('playlist', id)
      toast.success(`${name} added`, {
        description: `${channels.length.toLocaleString()} channels from your playlist.`,
      })
    },
    [catalog, selectView],
  )

  const removePlaylist = useCallback(
    (id: string) => {
      const name = persisted.playlists[id]?.name
      for (const ch of persisted.playlists[id]?.channels ?? []) catalog.byId.delete(ch.i)
      store.removePlaylist(id)
      if (playlistId === id) selectView('all')
      toast(`${name ?? 'Playlist'} removed`)
    },
    [persisted.playlists, playlistId, catalog, selectView],
  )

  const clearData = useCallback(() => {
    store.clear()
    setSettingsOpen(false)
    selectView('all')
    toast('Saved data cleared', {
      description: 'Saved channels, history and playlists are gone from this browser.',
    })
  }, [selectView])

  const togglePip = useCallback(async () => {
    const video = playback.videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      toast('Picture in picture is unavailable here')
    }
  }, [playback.videoRef])

  /* ── deep links ─────────────────────────────────────────────────────── */

  const openFromHash = useCallback(() => {
    const m = /[#&]c=([^&]+)/.exec(location.hash)
    if (!m) return
    const ch = catalog.byId.get(decodeURIComponent(m[1]))
    if (ch) playback.open(ch)
  }, [catalog, playback])

  const linkedOnce = useRef(false)
  useEffect(() => {
    if (!catalog.index || linkedOnce.current) return
    linkedOnce.current = true
    openFromHash()
  }, [catalog.index, openFromHash])

  useEffect(() => {
    const onHash = () => openFromHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [openFromHash])

  /* ── keyboard ───────────────────────────────────────────────────────── */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing =
        !!target && (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable)

      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape' && target === searchRef.current) {
        setQuery('')
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      const video = playback.videoRef.current
      if (!playback.channel || !video) return
      if (e.key === 'n') {
        e.preventDefault()
        playback.nextSource()
      }
      if (e.key === 'm') {
        e.preventDefault()
        video.muted = !video.muted
      }
      if (e.key === 'f') {
        e.preventDefault()
        void video.requestFullscreen?.()
      }
      if (e.key === ' ') {
        e.preventDefault()
        if (video.paused) void video.play()
        else video.pause()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [playback])

  /* ── render ─────────────────────────────────────────────────────────── */

  const counts = {
    all: catalog.index?.channels.length ?? 0,
    favorites: persisted.favorites.length,
    recent: persisted.recent.length,
  }

  return (
    <TooltipProvider delayDuration={400}>
      <SidebarProvider>
        <AppSidebar
          catalog={catalog}
          facets={facets}
          view={view}
          playlistId={playlistId}
          playlists={persisted.playlists}
          counts={counts}
          filters={filters}
          activeFilters={activeFilterCount(filters)}
          pageIsHttps={PAGE_IS_HTTPS}
          onSelectView={selectView}
          onRemovePlaylist={removePlaylist}
          onChangeFilters={changeFilters}
          onResetFilters={resetFilters}
        />

        <SidebarInset className="min-w-0">
          <AppHeader
            query={query}
            phase={playback.phase}
            searchRef={searchRef}
            onQueryChange={setQuery}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenPlaylist={() => setPlaylistOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-3 py-4 sm:px-5">
            {/* The stage stays put while the wall scrolls under it, so picking a
                channel never costs you your place. */}
            <div
              ref={stageRef}
              className={cn(
                playback.channel && 'lg:sticky lg:top-[3.5rem] lg:z-20',
              )}
            >
              <div className="bg-background/90 pb-1 lg:backdrop-blur-md">
                <PlayerStage
                  videoRef={playback.videoRef}
                  catalog={catalog}
                  channel={playback.channel}
                  sources={playback.sources}
                  index={playback.index}
                  phase={playback.phase}
                  head={playback.head}
                  body={playback.body}
                  actions={playback.actions}
                  renditions={playback.renditions}
                  saved={!!playback.channel && persisted.favorites.includes(playback.channel.i)}
                  onToggleSave={() =>
                    playback.channel && store.toggleFavorite(playback.channel.i)
                  }
                  onPickSource={playback.tune}
                  onNextSource={playback.nextSource}
                  onPickRendition={playback.setRendition}
                  onTogglePip={togglePip}
                />
              </div>
            </div>

            <section id="channels" aria-label="Channels" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="text-sm text-muted-foreground">
                  {loading
                    ? 'Loading channels…'
                    : results.length
                      ? `${results.length.toLocaleString()} ${results.length === 1 ? 'channel' : 'channels'}`
                      : 'No matches'}
                </p>

                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger size="sm" className="w-[9.5rem]" aria-label="Sort channels">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <GridSkeleton />
              ) : results.length ? (
                <ChannelGrid
                  channels={results}
                  catalog={catalog}
                  liveId={playback.channel?.i ?? null}
                  favorites={persisted.favorites}
                  shown={shown}
                  onReveal={() => setShown((n) => Math.min(n + PAGE, results.length))}
                  onPlay={play}
                  onToggleSave={(id) => store.toggleFavorite(id)}
                />
              ) : (
                <EmptyState
                  error={error}
                  view={view}
                  query={slowQuery}
                  onBrowseAll={() => {
                    resetFilters()
                    selectView('all')
                  }}
                />
              )}
            </section>

            <Footer generated={catalog.index?.generated} />
          </div>
        </SidebarInset>
      </SidebarProvider>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        catalog={catalog}
        recent={recentChannels}
        onPick={play}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={persisted.settings}
        onClearData={clearData}
      />
      <PlaylistDialog
        open={playlistOpen}
        onOpenChange={setPlaylistOpen}
        onLoaded={adoptPlaylist}
      />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}

/** An empty screen is an invitation to act, so each case names the next move. */
function EmptyState({
  error,
  view,
  query,
  onBrowseAll,
}: {
  error: string | null
  view: LibraryView
  query: string
  onBrowseAll: () => void
}) {
  const copy = error
    ? error
    : view === 'favorites'
      ? 'Nothing saved yet. Use the heart on any channel to keep it here.'
      : view === 'recent'
        ? 'Channels you watch will collect here.'
        : query
          ? `Nothing matches “${query}”. Try a shorter word, or clear the filters.`
          : 'No channels match these filters.'

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <p className="max-w-[48ch] text-sm text-muted-foreground">{copy}</p>
      {!error && view !== 'all' ? (
        <button
          type="button"
          onClick={onBrowseAll}
          className="text-primary cursor-pointer text-sm underline underline-offset-4"
        >
          Browse all channels
        </button>
      ) : null}
    </div>
  )
}

function Footer({ generated }: { generated?: string }) {
  return (
    <footer className="text-muted-foreground mt-2 grid gap-3 border-t pt-5 pb-8 text-xs leading-relaxed sm:grid-cols-2 sm:gap-8">
      <p>
        Channel data comes from{' '}
        <a
          href="https://github.com/iptv-org/iptv"
          className="text-foreground underline underline-offset-2"
        >
          iptv-org
        </a>
        , rebuilt daily
        {generated ? (
          <>
            {' '}
            (
            <time dateTime={generated}>
              {new Date(generated).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </time>
            )
          </>
        ) : null}
        . Tuner stores nothing about you and hosts no video — every stream is fetched straight from
        its own publisher.
      </p>
      <p>
        Streams come and go without notice, and roughly half of any public list is offline at a
        given moment. If a channel won't start, try its other sources.{' '}
        <a
          href="https://github.com/kamdev-choudhary/iptv-player"
          className="text-foreground underline underline-offset-2"
        >
          Source on GitHub
        </a>
      </p>
    </footer>
  )
}
