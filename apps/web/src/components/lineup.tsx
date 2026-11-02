import { useEffect, useRef } from 'react'
import { Star } from 'lucide-react'
import { Button, Empty, Readout, RowSkeleton, Tally, cn } from '@tuner/ui'
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
    <section aria-label="Channels" className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="text-small text-muted-foreground">
          {loading ? 'Loading channels' : `${total.toLocaleString()} channels`}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
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
          </>
        )}
      </div>
    </section>
  )
}
