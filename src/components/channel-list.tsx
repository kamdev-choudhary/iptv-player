import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { ChannelRow } from '@/components/channel-row'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Catalog } from '@/lib/channels'
import type { Channel, LibraryView, SortKey } from '@/lib/types'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'A to Z' },
  { value: 'quality', label: 'Best quality' },
  { value: 'sources', label: 'Most sources' },
]

export interface ChannelListProps {
  channels: Channel[]
  catalog: Catalog
  loading: boolean
  error: string | null
  view: LibraryView
  query: string
  searchRef: React.Ref<HTMLInputElement>
  onQueryChange: (value: string) => void
  sort: SortKey
  liveId: string | null
  favorites: string[]
  /** How many rows are painted; raised as the sentinel comes into view. */
  shown: number
  onReveal: () => void
  onSort: (sort: SortKey) => void
  onPlay: (ch: Channel) => void
  onToggleSave: (id: string) => void
  onBrowseAll: () => void
}

/**
 * The lineup, beside the picture rather than beneath it — so choosing what to
 * watch never costs you sight of what you are watching.
 */
export function ChannelList({
  channels,
  catalog,
  loading,
  error,
  view,
  query,
  searchRef,
  onQueryChange,
  sort,
  liveId,
  favorites,
  shown,
  onReveal,
  onSort,
  onPlay,
  onToggleSave,
  onBrowseAll,
}: ChannelListProps) {
  const sentinel = useRef<HTMLDivElement | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const reveal = useRef(onReveal)
  reveal.current = onReveal

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) reveal.current()
      },
      { root: scroller.current, rootMargin: '600px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  // A new query means a new list; start it from the top again.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [query, view, sort])

  const saved = new Set(favorites)

  return (
    <section
      aria-label="Channels"
      className="bg-card/40 flex min-h-0 flex-col overflow-hidden rounded-xl border-2"
    >
      <header className="flex shrink-0 flex-col gap-2 border-b-2 p-2">
        <div className="relative flex items-center">
          <Search className="text-muted-foreground pointer-events-none absolute left-2.5 size-4" />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by channel, country or category"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search channels"
            className="h-9 pr-9 pl-8 text-xs [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 size-7"
              onClick={() => onQueryChange('')}
            >
              <X className="size-3.5" />
              <span className="sr-only">Clear search</span>
            </Button>
          ) : (
            <kbd className="readout text-muted-foreground bg-muted pointer-events-none absolute right-2 hidden rounded-sm border px-1.5 py-1 xl:block">
              /
            </kbd>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-muted-foreground text-xs">
            {loading
              ? 'Loading channels…'
              : channels.length
                ? `${channels.length.toLocaleString()} ${channels.length === 1 ? 'channel' : 'channels'}`
                : 'No matches'}
          </p>
          <Select value={sort} onValueChange={(v) => onSort(v as SortKey)}>
            <SelectTrigger size="sm" className="h-7 w-[8.5rem] text-xs" aria-label="Sort channels">
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
      </header>

      <div
        ref={scroller}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5',
          '[scrollbar-width:thin]',
        )}
      >
        {loading ? (
          <ListSkeleton />
        ) : channels.length ? (
          <>
            <ul className="flex flex-col gap-0.5">
              {channels.slice(0, shown).map((ch) => (
                <ChannelRow
                  key={ch.i}
                  channel={ch}
                  catalog={catalog}
                  live={ch.i === liveId}
                  saved={saved.has(ch.i)}
                  onPlay={onPlay}
                  onToggleSave={onToggleSave}
                />
              ))}
            </ul>
            <div ref={sentinel} aria-hidden className="h-px" />
          </>
        ) : (
          <EmptyState error={error} view={view} query={query} onBrowseAll={onBrowseAll} />
        )}
      </div>
    </section>
  )
}

function ListSkeleton({ count = 14 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-0.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-2.5 p-1.5">
          <Skeleton className="size-10 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </li>
      ))}
    </ul>
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
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <p className="text-muted-foreground max-w-[40ch] text-xs leading-relaxed">{copy}</p>
      {!error && view !== 'all' ? (
        <button
          type="button"
          onClick={onBrowseAll}
          className="text-primary cursor-pointer text-xs underline underline-offset-4"
        >
          Browse all channels
        </button>
      ) : null}
    </div>
  )
}
