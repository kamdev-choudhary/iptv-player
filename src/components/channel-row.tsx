import { memo } from 'react'
import { Heart } from 'lucide-react'
import { ChannelLogo } from '@/components/channel-logo'
import { cn } from '@/lib/utils'
import { countryName, flagOf, type Catalog } from '@/lib/channels'
import type { Channel } from '@/lib/types'

export interface ChannelRowProps {
  channel: Channel
  catalog: Catalog
  live: boolean
  saved: boolean
  onPlay: (ch: Channel) => void
  onToggleSave: (id: string) => void
}

/**
 * One line of the lineup. Rows rather than tiles: a column this narrow shows
 * three times as many channels, and the country and quality stay readable
 * instead of being stacked over the artwork.
 */
export const ChannelRow = memo(function ChannelRow({
  channel,
  catalog,
  live,
  saved,
  onPlay,
  onToggleSave,
}: ChannelRowProps) {
  const flag = flagOf(catalog, channel.c)
  const country = countryName(catalog, channel.c)

  return (
    <li
      className={cn(
        'channel-row group relative flex items-center rounded-lg border-2 transition-colors',
        live
          ? 'border-primary/70 bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-accent/60',
      )}
    >
      <button
        type="button"
        onClick={() => onPlay(channel)}
        aria-label={`Tune in ${channel.n}`}
        aria-current={live ? 'true' : undefined}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 p-1.5 text-left focus-visible:outline-none"
      >
        <ChannelLogo
          channel={channel}
          className="size-10 shrink-0 rounded-md p-1"
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {live ? (
              <span
                aria-hidden
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--bar-red)]"
              />
            ) : null}
            <span className="truncate text-[13px] leading-tight font-medium" title={channel.n}>
              {channel.n}
            </span>
          </span>
          <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-[11px] leading-tight">
            {flag ? (
              <span aria-hidden className="shrink-0 leading-none">
                {flag}
              </span>
            ) : null}
            <span className="truncate">{country || 'Unlisted'}</span>
          </span>
        </span>

        <span className="readout text-muted-foreground/80 flex shrink-0 flex-col items-end gap-1 pr-1">
          {channel.q ? <span>{channel.q}p</span> : null}
          {(channel.k ?? 0) > 1 ? (
            <span className="text-muted-foreground/55">×{channel.k}</span>
          ) : null}
        </span>
      </button>

      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${channel.n} from saved` : `Save ${channel.n}`}
        onClick={() => onToggleSave(channel.i)}
        className={cn(
          'mr-1.5 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md transition',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
          saved
            ? 'text-[var(--keep)]'
            : 'text-muted-foreground/50 hover:text-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
        <Heart className="size-3.5" fill={saved ? 'currentColor' : 'none'} />
      </button>
    </li>
  )
})
