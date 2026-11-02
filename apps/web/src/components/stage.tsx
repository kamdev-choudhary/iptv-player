import type { ReactNode, RefObject } from 'react'
import { Maximize2, PictureInPicture2, SkipForward, Volume2, VolumeX } from 'lucide-react'
import {
  Badge,
  Button,
  PanelSelect,
  Readout,
  Tally,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@tuner/ui'
import type { ApiSource, ChannelDetail } from '@tuner/shared'
import { heightLabel, latencyLabel, sourceTally } from '@/lib/signal.ts'
import type { PlaybackState, StageAction } from '@/hooks/use-playback.ts'
import type { Rendition } from '@/lib/player.ts'
import { Slate } from './slate.tsx'

/**
 * The picture, and the readout strip under it.
 *
 * The strip is the instrument panel: which source is playing, whether it came
 * from the broadcaster or through this server, what resolution arrived and how
 * long it took. All four are facts the server or the player measured, printed
 * where a number belongs rather than described in a sentence.
 */

/** A hostname is what identifies a source when it has no feed name. */
function sourceLabel(source: ApiSource) {
  if (source.feed) return source.feed
  try {
    return new URL(source.url).hostname
  } catch {
    return source.url.slice(0, 40)
  }
}

function SourceRow({
  source,
  index,
  active,
  onTune,
}: {
  source: ApiSource
  index: number
  active: boolean
  onTune: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTune}
      className={cn(
        'flex w-full items-center gap-2 border-b px-3 py-1.5 text-left last:border-b-0',
        active ? 'bg-signal/10 text-signal' : 'text-muted-foreground hover:bg-accent',
      )}
    >
      <Tally state={sourceTally(source)} />
      <span className="tabular w-5 text-micro">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-micro">{sourceLabel(source)}</span>
      {source.play === 'proxy' ? <Badge variant="routed">server</Badge> : null}
      {source.labels.slice(0, 1).map((label) => (
        <Badge key={label}>{label}</Badge>
      ))}
      <Readout value={heightLabel(source.height)} className="w-11 text-right" />
      <Readout value={latencyLabel(source.health?.latencyMs ?? null)} className="w-12 text-right" />
    </button>
  )
}

/** One label-and-measurement pair in the readout strip. */
function Gauge({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-micro text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * Every playback control comes from the playback hook, which owns the video
 * element. Fullscreen is the exception: it applies to the stage container, so
 * the page that lays the stage out passes it in.
 */
export interface StageProps extends PlaybackState {
  channel: ChannelDetail | null
  sources: ApiSource[]
  videoRef: RefObject<HTMLVideoElement | null>
  renditions: Rendition[]
  activeRendition: number
  muted: boolean
  toggleMute: () => void
  nextSource: () => void
  tuneTo: (index: number) => void
  setRendition: (index: number) => void
  togglePictureInPicture: () => void
  onFullscreen: () => void
  actions: StageAction[]
}

export function Stage({
  channel,
  sources,
  videoRef,
  phase,
  head,
  body,
  reason,
  actions,
  sourceIndex,
  viaProxy,
  renditions,
  activeRendition,
  muted,
  toggleMute,
  nextSource,
  tuneTo,
  setRendition,
  togglePictureInPicture,
  onFullscreen,
}: StageProps) {
  const source = sources[sourceIndex]
  const live = phase === 'live'
  const shownHeight =
    activeRendition >= 0 ? (renditions[activeRendition]?.height ?? null) : (source?.height ?? null)

  return (
    <section aria-label="Player" className="flex min-h-0 flex-col bg-background">
      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          playsInline
          controls={false}
          muted={muted}
          className={cn('size-full', live ? 'opacity-100' : 'pointer-events-none opacity-0')}
        />
        {live ? null : (
          <div className="absolute inset-0">
            <Slate
              head={head}
              body={body}
              reason={reason}
              actions={actions}
              tuning={phase === 'tuning'}
            />
          </div>
        )}
      </div>

      {/* Readout strip. Labels left, measurements right, in fixed columns. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t bg-card px-3 py-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="truncate text-section leading-tight">{channel?.name ?? 'Tuner'}</h1>
          {viaProxy && live ? <Badge variant="routed">through server</Badge> : null}
          {live && source?.health?.ok === false ? <Badge variant="hold">unverified</Badge> : null}
        </div>

        <dl className="flex items-center gap-4">
          <Gauge label="Source">
            <Readout
              value={sources.length ? `${sourceIndex + 1}/${sources.length}` : '—'}
              tone="foreground"
            />
          </Gauge>
          <Gauge label="Resolution">
            <Readout value={heightLabel(shownHeight)} tone="foreground" />
          </Gauge>
          <Gauge label="Latency">
            <Readout value={latencyLabel(source?.health?.latencyMs ?? null)} tone="foreground" />
          </Gauge>
        </dl>

        <div className="flex items-center gap-1">
          {renditions.length > 1 ? (
            <PanelSelect
              aria-label="Rendition"
              className="h-7 w-24 text-micro"
              value={String(activeRendition)}
              onValueChange={(value) => setRendition(Number(value))}
              options={[
                { value: '-1', label: 'Auto' },
                ...renditions.map((r) => ({ value: String(r.index), label: `${r.height}p` })),
              ]}
            />
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{muted ? 'Unmute (m)' : 'Mute (m)'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={nextSource}
                disabled={sources.length < 2}
                aria-label="Next source"
              >
                <SkipForward />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next source (n)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={togglePictureInPicture}
                disabled={!live}
                aria-label="Picture in picture"
              >
                <PictureInPicture2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Picture in picture (p)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onFullscreen} aria-label="Fullscreen">
                <Maximize2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fullscreen (f)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* The source strip. Shown whenever a channel has alternatives, because
          picking a different one is the main thing an operator does here. */}
      {sources.length > 1 ? (
        <div className="max-h-44 shrink-0 overflow-y-auto border-t bg-card">
          {sources.map((s, index) => (
            <SourceRow
              key={s.id}
              source={s}
              index={index}
              active={index === sourceIndex}
              onTune={() => tuneTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
