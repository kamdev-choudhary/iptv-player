import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import { ChannelList } from '@/components/channel-list'
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
import type { Channel, Filters, LibraryView } from '@/lib/types'

/** Rows painted per scroll batch. */
const PAGE = 60

const PAGE_IS_HTTPS = location.protocol === 'https:'

export default function App() {
  const { catalog, loading, error } = useCatalog()
  const persisted = usePersisted()

  const [view, setView] = useState<LibraryView>('all')
  const [playlistId, setPlaylistId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  // Country, language, quality and the rest come back as they were left.
  const filters = persisted.filters
  const sort = persisted.sort

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
      // Only matters on a narrow screen, where the panes stack.
      if (window.matchMedia('(max-width: 1279px)').matches) {
        stageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
    },
    [playback],
  )

  const selectView = useCallback((next: LibraryView, playlist: string | null = null) => {
    setView(next)
    setPlaylistId(playlist)
  }, [])

  const changeFilters = useCallback((patch: Partial<Filters>) => store.setFilters(patch), [])

  const resetFilters = useCallback(() => {
    store.resetFilters()
    setQuery('')
  }, [])

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
            phase={playback.phase}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenPlaylist={() => setPlaylistOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {/* Three panes: what narrows the lineup, what is on, and the lineup
              itself. The list sits beside the picture, never under it. */}
          {/* Stacked as picture, lineup, colophon on a narrow screen; at xl the
              lineup moves alongside and the colophon tucks under the picture. */}
          <div
            className={cn(
              'mx-auto flex w-full max-w-[2000px] flex-1 flex-col gap-3 p-2.5 sm:p-3',
              'xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[minmax(0,1fr)_auto] xl:gap-x-4 xl:gap-y-3 xl:p-4',
              '2xl:grid-cols-[minmax(0,1fr)_25rem]',
            )}
          >
            <main className="flex min-w-0 flex-1 flex-col gap-3 xl:col-start-1 xl:row-start-1">
              <div ref={stageRef} className="flex flex-1 scroll-mt-16 flex-col justify-center">
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
                  onToggleSave={() => playback.channel && store.toggleFavorite(playback.channel.i)}
                  onPickSource={playback.tune}
                  onNextSource={playback.nextSource}
                  onPickRendition={playback.setRendition}
                  onTogglePip={togglePip}
                />
              </div>
            </main>

            {/* Stacked below xl, a column beside the picture at xl and up. */}
            <aside
              className={cn(
                'flex min-h-0 flex-col',
                'h-[clamp(20rem,58svh,36rem)]',
                'xl:sticky xl:top-[4.5rem] xl:col-start-2 xl:row-span-2 xl:row-start-1',
                'xl:h-[calc(100svh-5.5rem)]',
              )}
            >
              <ChannelList
                channels={results}
                catalog={catalog}
                loading={loading}
                error={error}
                view={view}
                query={query}
                searchRef={searchRef}
                onQueryChange={setQuery}
                sort={sort}
                liveId={playback.channel?.i ?? null}
                favorites={persisted.favorites}
                shown={shown}
                onReveal={() => setShown((n) => Math.min(n + PAGE, results.length))}
                onSort={(next) => store.setSort(next)}
                onPlay={play}
                onToggleSave={(id) => store.toggleFavorite(id)}
                onBrowseAll={() => {
                  resetFilters()
                  selectView('all')
                }}
              />
            </aside>

            <div className="xl:col-start-1 xl:row-start-2">
              <Footer generated={catalog.index?.generated} />
            </div>
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

function Footer({ generated }: { generated?: string }) {
  return (
    <footer className="text-muted-foreground mt-auto grid gap-2 border-t-2 pt-3 text-[11px] leading-relaxed sm:grid-cols-2 sm:gap-6">
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
