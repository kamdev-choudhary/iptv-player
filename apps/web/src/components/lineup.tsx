import { useEffect, useRef } from 'react'
import { Star } from 'lucide-react'
import { Button, Empty, PanelScroll, Readout, RowSkeleton, Tally, cn } from '@tuner/ui'
import type { ApiChannel, Facets } from '@tuner/shared'
import { channelSummary, channelTally, heightLabel } from '@/lib/signal.ts'
import { prefs } from '@/lib/prefs.ts'
import { ChannelMark } from './channel-mark.tsx'

/**
 * The lineup: ruled rows, not cards.
 *
 * Each row carries four things in fixed columns — state, identity, resolution,
 * live source count — so the eye can run down any one of them. Numbers are
 * right-aligned in a mono so the digits line up, which is the only reason to
 * use a mono anywhere in this interface.
 */

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
        'group relative flex h-12 items-center gap-3 border-b pr-2 pl-3 text-left',
        tuned ? 'bg-signal/10' : 'hover:bg-accent',
      )}
    >
      {/* The tuned channel is marked by a rail, not a shadow or a glow. */}
      {tuned ? <span className="absolute inset-y-0 left-0 w-0.5 bg-signal" aria-hidden /> : null}

      <Tally state={channelTally(channel)} />

      <button
        type="button"
        onClick={onOpen}
        title={channelSummary(channel)}
        className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
      >
        <ChannelMark name={channel.name} logo={channel.logo} size="sm" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-small', tuned && 'text-signal')}>
            {channel.name}
          </span>
          <span className="block truncate text-micro text-muted-foreground">
            {country ? `${country.extra ?? ''} ${country.name}`.trim() : 'Unlisted country'}
          </span>
        </span>
      </button>

      <Readout value={heightLabel(channel.bestHeight)} className="w-12 text-right" />
      <Readout
        value={channel.sourceCount ? `${channel.liveCount}/${channel.sourceCount}` : '—'}
        tone={channel.liveCount > 0 ? 'live' : 'muted'}
        className="w-12 text-right"
      />

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => prefs.toggleFavorite(channel.id)}
        aria-label={starred ? `Unstar ${channel.name}` : `Star ${channel.name}`}
        aria-pressed={starred}
        className={cn(starred ? 'text-signal' : 'text-border group-hover:text-muted-foreground')}
      >
        <Star fill={starred ? 'currentColor' : 'none'} strokeWidth={1.75} />
      </Button>
    </div>
  )
}

export interface LineupProps {
  channels: ApiChannel[]
  facets: Facets | undefined
  tunedId: string | null
  favorites: readonly string[]
  loading: boolean
  /** True while an older page is on screen and a newer query is in flight. */
  refreshing: boolean
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
  facets,
  tunedId,
  favorites,
  loading,
  refreshing,
  hasMore,
  loadingMore,
  total,
  error,
  onOpen,
  onLoadMore,
  onClearFilters,
}: LineupProps) {
  const sentinel = useRef<HTMLDivElement>(null)

  // Paging happens when the end of the list comes into view, which is the only
  // thing scroll position should ever trigger.
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore])

  return (
    <section aria-label="Lineup" className="flex min-h-0 flex-col border-l bg-card">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <h2 className="text-small">Lineup</h2>
        <span className="tabular text-micro text-muted-foreground">
          {loading ? 'loading' : `${total.toLocaleString()} channels`}
        </span>
        {refreshing ? <output className="ml-auto text-micro text-signal">updating</output> : null}
      </header>

      <PanelScroll>
        {error ? (
          <Empty
            head="The lineup could not be loaded"
            body={error.message}
            action={
              <Button size="sm" onClick={() => window.location.reload()}>
                Reload
              </Button>
            }
          />
        ) : loading ? (
          Array.from({ length: 12 }, (_, i) => <RowSkeleton key={i} />)
        ) : channels.length === 0 ? (
          <Empty
            head="Nothing matches those filters"
            body="Widen the search, or clear the filters to see the whole lineup again."
            action={
              <Button size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            {channels.map((channel) => (
              <Row
                key={channel.id}
                channel={channel}
                facets={facets}
                tuned={channel.id === tunedId}
                starred={favorites.includes(channel.id)}
                onOpen={() => onOpen(channel)}
              />
            ))}
            <div ref={sentinel} className="h-px" />
            {loadingMore ? <RowSkeleton /> : null}
            {!hasMore ? (
              <p className="px-3 py-4 text-micro text-muted-foreground">End of the lineup.</p>
            ) : null}
          </>
        )}
      </PanelScroll>
    </section>
  )
}
