import { memo } from 'react'
import { Heart } from 'lucide-react'
import { ChannelLogo } from '@/components/channel-logo'
import { ColorBars } from '@/components/color-bars'
import { cn } from '@/lib/utils'
import { countryName, flagOf, type Catalog } from '@/lib/channels'
import type { Channel } from '@/lib/types'

export interface ChannelTileProps {
  channel: Channel
  catalog: Catalog
  live: boolean
  saved: boolean
  onPlay: (ch: Channel) => void
  onToggleSave: (id: string) => void
}

/**
 * One tile in the wall. Kept memoised and cheap: the grid can hold several
 * thousand of these at once.
 */
export const ChannelTile = memo(function ChannelTile({
  channel,
  catalog,
  live,
  saved,
  onPlay,
  onToggleSave,
}: ChannelTileProps) {
  const flag = flagOf(catalog, channel.c)
  const country = countryName(catalog, channel.c)

  return (
    <li
      className={cn(
        'channel-tile group relative isolate flex flex-col overflow-hidden rounded-lg border-2 bg-card',
        'transition-colors duration-150',
        live ? 'border-primary/70 bg-primary/5' : 'border-border hover:bg-accent/50',
      )}
    >
      {/* A live tile wears the bars, at the smallest of the three scales. */}
      {live ? <ColorBars phase="live" className="absolute inset-x-0 top-0 z-10 h-[3px]" /> : null}

      <button
        type="button"
        onClick={() => onPlay(channel)}
        aria-label={`Tune in ${channel.n}`}
        className="flex flex-1 cursor-pointer flex-col gap-1.5 p-1.5 text-left focus-visible:outline-none"
      >
        <ChannelLogo channel={channel} className="aspect-[16/10] w-full rounded-md p-2" />

        <span className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-0.5">
          <span className="truncate text-xs leading-tight font-semibold" title={channel.n}>
            {channel.n}
          </span>
          {/* Where it broadcasts from, and what it broadcasts at. The badge used
              to sit over the artwork, where it covered half the logos. */}
          <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-[10px] leading-tight">
            {flag ? (
              <span aria-hidden className="shrink-0 leading-none">
                {flag}
              </span>
            ) : null}
            <span className="truncate">{country || 'Unlisted'}</span>
            {channel.q ? (
              <span className="readout text-muted-foreground/75 ml-auto shrink-0">
                {channel.q}p
              </span>
            ) : null}
          </span>
        </span>
      </button>

      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${channel.n} from saved` : `Save ${channel.n}`}
        onClick={() => onToggleSave(channel.i)}
        className={cn(
          'absolute top-1 right-1 z-10 grid size-6 cursor-pointer place-items-center rounded-md',
          'bg-background/80 backdrop-blur-sm transition',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
          saved
            ? 'text-[var(--keep)] opacity-100'
            : 'text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground',
        )}
      >
        <Heart className="size-3" fill={saved ? 'currentColor' : 'none'} />
      </button>
    </li>
  )
})
