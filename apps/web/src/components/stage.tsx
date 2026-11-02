import type { RefObject } from 'react'
import { clsx } from 'clsx'
import { Maximize2, PictureInPicture2, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { Badge, Button, Readout, Select, Tally } from '@tuner/ui'
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
      className={clsx(
        'flex w-full items-center gap-2 border-b  px-3 py-1.5 text-left last:border-b-0',
        active
          ? 'bg-signal/10 text-signal'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Tally state={sourceTally(source)} />
      <span className="tabular w-5 text-micro">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-micro">
        {source.feed ?? new URL(source.url).hostname}
      </span>
      {source.play === 'proxy' ? <Badge tone="routed">server</Badge> : null}
      {source.labels.slice(0, 1).map((label) => (
        <Badge key={label}>{label}</Badge>
      ))}
      <Readout value={heightLabel(source.height)} className="w-11 text-right" />
      <Readout value={latencyLabel(source.health?.latencyMs ?? null)} className="w-12 text-right" />
    </button>
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

  return (
    <section aria-label="Player" className="flex min-h-0 flex-col bg-background">
      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          playsInline
          controls={false}
          muted={muted}
          className={clsx('size-full', live ? 'opacity-100' : 'pointer-events-none opacity-0')}
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
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t  bg-card px-3 py-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="truncate text-section leading-tight text-foreground">
            {channel?.name ?? 'Tuner'}
          </h1>
          {viaProxy && live ? <Badge tone="routed">through server</Badge> : null}
          {live && source?.health?.ok === false ? <Badge tone="hold">unverified</Badge> : null}
        </div>

        <dl className="flex items-center gap-4">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-micro text-muted-foreground">Source</dt>
            <dd>
              <Readout
                value={sources.length ? `${sourceIndex + 1}/${sources.length}` : '—'}
                tone="readout"
              />
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-micro text-muted-foreground">Resolution</dt>
            <dd>
              <Readout
                value={heightLabel(
                  activeRendition >= 0
                    ? (renditions[activeRendition]?.height ?? null)
                    : (source?.height ?? null),
                )}
                tone="readout"
              />
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-micro text-muted-foreground">Latency</dt>
            <dd>
              <Readout value={latencyLabel(source?.health?.latencyMs ?? null)} tone="readout" />
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-1">
          {renditions.length > 1 ? (
            <Select
              aria-label="Rendition"
              className="h-7 w-28 text-micro"
              value={String(activeRendition)}
              onChange={(e) => setRendition(Number(e.target.value))}
              options={[
                { value: '-1', label: 'Auto' },
                ...renditions.map((r) => ({
                  value: String(r.index),
                  label: `${r.height}p`,
                })),
              ]}
            />
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={nextSource}
            disabled={sources.length < 2}
            aria-label="Next source"
            title="Next source (n)"
          >
            <SkipForward className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePictureInPicture}
            disabled={!live}
            aria-label="Picture in picture"
          >
            <PictureInPicture2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onFullscreen}
            aria-label="Fullscreen"
            title="Fullscreen (f)"
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* The source strip. Shown whenever a channel has alternatives, because
 picking a different one is the main thing an operator does here. */}
      {sources.length > 1 ? (
        <div className="max-h-44 shrink-0 overflow-y-auto border-t  bg-card">
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
