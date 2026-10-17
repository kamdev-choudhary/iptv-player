import { useEffect, useRef } from 'react'
import { ChannelTile } from '@/components/channel-tile'
import { Skeleton } from '@/components/ui/skeleton'
import type { Catalog } from '@/lib/channels'
import type { Channel } from '@/lib/types'

export interface ChannelGridProps {
  channels: Channel[]
  catalog: Catalog
  liveId: string | null
  favorites: string[]
  /** How many are painted; raised as the sentinel comes into view. */
  shown: number
  onReveal: () => void
  onPlay: (ch: Channel) => void
  onToggleSave: (id: string) => void
}

const COLUMNS =
  'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9'

export function ChannelGrid({
  channels,
  catalog,
  liveId,
  favorites,
  shown,
  onReveal,
  onPlay,
  onToggleSave,
}: ChannelGridProps) {
  const sentinel = useRef<HTMLDivElement | null>(null)
  const reveal = useRef(onReveal)
  reveal.current = onReveal

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) reveal.current()
      },
      { rootMargin: '800px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  const saved = new Set(favorites)

  return (
    <>
      <ul className={COLUMNS}>
        {channels.slice(0, shown).map((ch) => (
          <ChannelTile
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
  )
}

/** Placeholder tiles, so the wall has its shape before the index arrives. */
export function GridSkeleton({ count = 40 }: { count?: number }) {
  return (
    <ul className={COLUMNS} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-2 rounded-lg border-2 border-border bg-card p-2">
          <Skeleton className="aspect-[16/10] w-full rounded-md" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </li>
      ))}
    </ul>
  )
}
