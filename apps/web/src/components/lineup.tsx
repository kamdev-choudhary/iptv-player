import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, Star } from 'lucide-react'
import { Button, Empty, Input, Readout, RowSkeleton, Tally, cn } from '@tuner/ui'
import type { ApiChannel, Facets } from '@tuner/shared'
import { channelSummary, channelTally, heightLabel } from '@/lib/signal.ts'
import { prefs } from '@/lib/prefs.ts'
import { ChannelMark } from './channel-mark.tsx'

/**
 * The channel list.
 *
 * Four things per row and no more: whether it works, what it is, where it is
 * from, and how sharp it is. An earlier version also printed the live-source
 * fraction, which was two more digits on every row saying what the dot already
 * says — the kind of density that makes a long list tiring to read.
 *
 * Only the rows near the viewport are in the document. Paging appends, so
 * someone scrolling a filtered-but-still-large catalog accumulates pages, and
 * every row carries a logo: keeping all of them mounted is a list that gets
 * heavier the longer it is used.
 */

/** Rows are a fixed composition, so the estimate is right before measuring. */
const ROW_HEIGHT = 60

/** How close to the end of the loaded rows asks the server for the next page. */
const PREFETCH_ROWS = 8

function Row({
  channel,
  facets,
  tuned,
  starred,
  onOpen,
}: {
  channel: ApiChannel
  facets: Facets | undefined
  tuned: boolean
  starred: boolean
  onOpen: () => void
}) {
  const country = facets?.countries.find((c) => c.code === channel.country)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-md pr-1 pl-3 transition-colors',
        tuned ? 'bg-signal/10' : 'hover:bg-accent',
      )}
    >
      <Tally state={channelTally(channel)} />

      <button
        type="button"
        onClick={onOpen}
        title={channelSummary(channel)}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
      >
        <ChannelMark name={channel.name} logo={channel.logo} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate', tuned && 'text-signal')}>{channel.name}</span>
          {country ? (
            <span className="block truncate text-small text-muted-foreground">
              {`${country.extra ?? ''} ${country.name}`.trim()}
            </span>
          ) : null}
        </span>
        {channel.bestHeight ? <Readout value={heightLabel(channel.bestHeight)} /> : null}
      </button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => prefs.toggleFavorite(channel.id)}
        aria-label={starred ? `Unstar ${channel.name}` : `Star ${channel.name}`}
        aria-pressed={starred}
        className={cn(
          starred ? 'text-signal' : 'text-transparent group-hover:text-muted-foreground',
        )}
      >
        <Star fill={starred ? 'currentColor' : 'none'} strokeWidth={1.75} />
      </Button>
    </div>
  )
}

export interface LineupProps {
  channels: ApiChannel[]
  searchRef: RefObject<HTMLInputElement | null>
  search: string
  onSearch: (value: string) => void
  facets: Facets | undefined
  tunedId: string | null
  favorites: readonly string[]
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  total: number
  error: Error | null
  onOpen: (channel: ApiChannel) => void
  onLoadMore: () => void
  onClearFilters: () => void
}

export function Lineup({
  channels,
  searchRef,
  search,
  onSearch,
  facets,
  tunedId,
  favorites,
  loading,
  hasMore,
  loadingMore,
  total,
  error,
  onOpen,
  onLoadMore,
  onClearFilters,
}: LineupProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // `includes` on every row of every render is the kind of thing that only
  // shows up once the list is long.
  const starredIds = useMemo(() => new Set(favorites), [favorites])

  // The compiler rule objects to hooks that hand back functions, because it
  // cannot memoize around them. That is exactly what a virtualizer is, and the
  // values taken from it below are read during render rather than passed into
  // anything memoized, so there is no stale snapshot for it to hold.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // Enough rows past the edge that a flick does not reach blank space.
    overscan: 8,
    getItemKey: (index) => channels[index]?.id ?? index,
  })

  const items = virtualizer.getVirtualItems()

  // Paging happens when the rendered window reaches the end of what is loaded,
  // which is the only thing scroll position should ever trigger. A sentinel
  // element cannot do this job any more: it would sit at the bottom of a
  // spacer thousands of pixels tall and never be rendered.
  const lastIndex = items.at(-1)?.index
  useEffect(() => {
    if (!hasMore || loadingMore || lastIndex === undefined) return
    if (lastIndex >= channels.length - PREFETCH_ROWS) onLoadMore()
  }, [hasMore, loadingMore, lastIndex, channels.length, onLoadMore])

  // A different first row means a different list — a new search, a changed
  // filter, a switch to Starred — and reading a new list from halfway down is
  // not what anyone meant. Appending a page leaves the first row alone, so
  // paging does not trip this.
  const firstId = channels[0]?.id
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [firstId])

  return (
    <section aria-label="Channels" className="flex h-full min-h-0 flex-col">
      {/* The search sits on top of what it searches, and the count under it is
          the answer to what it just did. */}
      <header className="flex shrink-0 flex-col gap-2 border-b p-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search channels"
            aria-label="Search channels"
            className="h-9 rounded-pill pl-9"
          />
        </div>
        <p className="px-1 text-small text-muted-foreground">
          {loading
            ? 'Loading channels'
            : search
              ? `${total.toLocaleString()} matching \u201c${search}\u201d`
              : `${total.toLocaleString()} channels`}
        </p>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {error ? (
          <Empty
            head="The channel list could not be loaded"
            body={error.message}
            action={
              <Button size="sm" onClick={() => window.location.reload()}>
                Reload
              </Button>
            }
          />
        ) : loading ? (
          Array.from({ length: 10 }, (_, i) => <RowSkeleton key={i} />)
        ) : channels.length === 0 ? (
          <Empty
            head="Nothing matches"
            body="Try a shorter search, or clear the filters to see everything again."
            action={
              <Button size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            {/* The spacer carries the full height of the list, so the
                scrollbar tells the truth about how much is below. */}
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {items.map((item) => {
                const channel = channels[item.index]!
                return (
                  <div
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <Row
                      channel={channel}
                      facets={facets}
                      tuned={channel.id === tunedId}
                      starred={starredIds.has(channel.id)}
                      onOpen={() => onOpen(channel)}
                    />
                  </div>
                )
              })}
            </div>
            {loadingMore ? <RowSkeleton /> : null}
          </>
        )}
      </div>
    </section>
  )
}
