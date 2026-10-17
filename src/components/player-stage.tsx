import { ChevronRight, Heart, PictureInPicture2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChannelLogo } from '@/components/channel-logo'
import { TestCard } from '@/components/test-card'
import { cn } from '@/lib/utils'
import {
  categoryName,
  countryName,
  flagOf,
  languageName,
  sourceNotes,
  type Catalog,
} from '@/lib/channels'
import type { Rendition } from '@/lib/player'
import type { Channel, Source } from '@/lib/types'
import type { CardAction, Phase } from '@/hooks/use-playback'

export interface PlayerStageProps {
  videoRef: React.Ref<HTMLVideoElement>
  catalog: Catalog
  channel: Channel | null
  sources: Source[]
  index: number
  phase: Phase
  head: string
  body: string
  actions: CardAction[]
  renditions: Rendition[]
  saved: boolean
  onToggleSave: () => void
  onPickSource: (index: number) => void
  onNextSource: () => void
  onPickRendition: (index: number) => void
  onTogglePip: () => void
}

export function PlayerStage({
  videoRef,
  catalog,
  channel,
  sources,
  index,
  phase,
  head,
  body,
  actions,
  renditions,
  saved,
  onToggleSave,
  onPickSource,
  onNextSource,
  onPickRendition,
  onTogglePip,
}: PlayerStageProps) {
  const heights = renditions.filter((r) => r.height).sort((a, b) => b.height - a.height)

  return (
    <section aria-label="Player" className="flex flex-col gap-2.5">
      <div
        className={cn(
          'relative mx-auto w-full overflow-hidden rounded-xl border-2 bg-black',
          // Nothing picked yet: a slate, not a blank 16:9 that swallows the fold.
          channel
            ? 'aspect-video max-w-[calc(58vh*16/9)]'
            : 'h-[clamp(7rem,17vh,10rem)]',
          phase === 'live' ? 'border-primary/50' : 'border-border',
        )}
      >
        <video
          ref={videoRef}
          playsInline
          controls
          className={cn('size-full bg-black object-contain', phase !== 'live' && 'opacity-0')}
        />
        {phase !== 'live' ? (
          <TestCard phase={phase} head={head} body={body} actions={actions} compact={!channel} />
        ) : null}
      </div>

      {channel ? (
        <NowPlaying
          catalog={catalog}
          channel={channel}
          sources={sources}
          index={index}
          phase={phase}
          heights={heights}
          saved={saved}
          onToggleSave={onToggleSave}
          onPickSource={onPickSource}
          onNextSource={onNextSource}
          onPickRendition={onPickRendition}
          onTogglePip={onTogglePip}
        />
      ) : null}
    </section>
  )
}

function NowPlaying({
  catalog,
  channel,
  sources,
  index,
  phase,
  heights,
  saved,
  onToggleSave,
  onPickSource,
  onNextSource,
  onPickRendition,
  onTogglePip,
}: {
  catalog: Catalog
  channel: Channel
  sources: Source[]
  index: number
  phase: Phase
  heights: Rendition[]
  saved: boolean
  onToggleSave: () => void
  onPickSource: (index: number) => void
  onNextSource: () => void
  onPickRendition: (index: number) => void
  onTogglePip: () => void
}) {
  const flag = flagOf(catalog, channel.c)
  const country = countryName(catalog, channel.c)
  const categories = (channel.g || []).map((g) => categoryName(catalog, g))
  const languages = (channel.l || []).slice(0, 2).map((l) => languageName(catalog, l))

  return (
    <div className="mx-auto flex w-full max-w-[calc(58vh*16/9)] flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border-2 bg-card px-3 py-2.5">
      <ChannelLogo channel={channel} className="size-11 shrink-0 rounded-md p-1.5" />

      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2">
          {phase === 'live' ? (
            <span
              aria-hidden
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--bar-red)]"
            />
          ) : null}
          <h2 className="ident truncate text-base font-semibold" title={channel.n}>
            {channel.n}
          </h2>
        </div>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {country ? (
            <span className="shrink-0">
              {flag ? <span aria-hidden>{flag} </span> : null}
              {country}
            </span>
          ) : null}
          {categories.length ? <span className="truncate">{categories.join(', ')}</span> : null}
          {languages.length ? <span className="truncate">{languages.join(', ')}</span> : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {sources.length > 1 ? (
          <>
            <Select value={String(index)} onValueChange={(v) => onPickSource(Number(v))}>
              <SelectTrigger size="sm" className="readout w-[7.5rem]" aria-label="Source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {sources.map((s, i) => (
                  <SelectItem key={i} value={String(i)} className="readout">
                    {i + 1}/{sources.length}
                    {sourceNotes(s).length ? ` · ${sourceNotes(s).join(' · ')}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="sm" onClick={onNextSource}>
                  <ChevronRight className="size-4" />
                  Next source
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Try the next of {sources.length} sources <kbd className="ml-1">N</kbd>
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}

        {heights.length > 1 ? (
          <Select defaultValue="-1" onValueChange={(v) => onPickRendition(Number(v))}>
            <SelectTrigger size="sm" className="readout w-[5.5rem]" aria-label="Resolution">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-1" className="readout">
                Auto
              </SelectItem>
              {heights.map((r) => (
                <SelectItem key={r.i} value={String(r.i)} className="readout">
                  {r.height}p
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={saved ? 'default' : 'secondary'}
              size="sm"
              aria-pressed={saved}
              onClick={onToggleSave}
            >
              <Heart className="size-4" fill={saved ? 'currentColor' : 'none'} />
              {saved ? 'Saved' : 'Save'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{saved ? 'Remove from saved' : 'Keep in saved channels'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={onTogglePip}>
              <PictureInPicture2 className="size-4" />
              <span className="sr-only">Picture in picture</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Picture in picture</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
