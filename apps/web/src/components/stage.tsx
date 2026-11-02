import type { RefObject } from 'react'
import { Layers, Maximize2, Pause, PictureInPicture2, Play, Volume2, VolumeX } from 'lucide-react'
import {
  Badge,
  Button,
  PanelSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Readout,
  Tally,
  cn,
} from '@tuner/ui'
import type { ApiSource, ChannelDetail } from '@tuner/shared'
import { heightLabel, latencyLabel, sourceTally } from '@/lib/signal.ts'
import type { PlaybackState, StageAction } from '@/hooks/use-playback.ts'
import type { Rendition } from '@/lib/player.ts'
import { Slate } from './slate.tsx'

/**
 * The picture, and one quiet line of controls under it.
 *
 * An earlier version printed source number, resolution and latency as three
 * labelled gauges, and listed every source permanently below. All of it was
 * true and none of it was wanted while something was playing — so the numbers
 * moved into the source list, and the source list moved behind a button.
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

/**
 * The sources behind a channel, on request. This is where the telemetry lives:
 * which ones answered the last probe, how fast, and at what resolution.
 */
function SourceList({
  sources,
  sourceIndex,
  onTune,
}: {
  sources: ApiSource[]
  sourceIndex: number
  onTune: (index: number) => void
}) {
  return (
    <div className="flex max-h-80 flex-col overflow-y-auto">
      {sources.map((source, index) => (
        <button
          key={source.id}
          type="button"
          onClick={() => onTune(index)}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-2 text-left text-small',
            index === sourceIndex ? 'bg-signal/10 text-signal' : 'hover:bg-accent',
          )}
        >
          <Tally state={sourceTally(source)} />
          <span className="min-w-0 flex-1 truncate">{sourceLabel(source)}</span>
          {source.play === 'proxy' ? <Badge variant="routed">server</Badge> : null}
          <Readout value={heightLabel(source.height)} className="w-11 text-right" />
          <Readout
            value={latencyLabel(source.health?.latencyMs ?? null)}
            className="w-12 text-right"
          />
        </button>
      ))}
    </div>
  )
}

/**
 * Whether the thing you just tapped is actually playing.
 *
 * The picture answers this on a desktop, where it is always in view. On a
 * phone it is a quarter of the screen above a list you are scrolling, so the
 * state is also said in words right beside the channel's name.
 */
function NowPlaying({ phase, viaProxy }: { phase: PlaybackState['phase']; viaProxy: boolean }) {
  if (phase === 'idle') return null

  const state = phase === 'live' ? 'live' : phase === 'dead' ? 'fault' : 'hold'
  const label =
    phase === 'live'
      ? viaProxy
        ? 'Playing via server'
        : 'Playing'
      : phase === 'dead'
        ? 'Not playing'
        : 'Connecting'

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Tally state={state} />
      <span
        className={cn(
          'text-small',
          phase === 'live'
            ? 'text-live'
            : phase === 'dead'
              ? 'text-fault'
              : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </span>
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
  paused: boolean
  toggleMute: () => void
  togglePlay: () => void
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
  paused,
  toggleMute,
  togglePlay,
  tuneTo,
  setRendition,
  togglePictureInPicture,
  onFullscreen,
}: StageProps) {
  const live = phase === 'live'

  return (
    <section aria-label="Player" className="flex h-full min-h-0 flex-col gap-3">
      {/* 16:9 on a phone, where the list below needs the rest of the frame; on
          a desktop it takes whatever height the column has left. */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black lg:aspect-auto lg:min-h-0 lg:flex-1">
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

      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h1
          className={cn(
            'min-w-0 flex-1 truncate text-section leading-tight',
            // Nothing tuned yet: this is a prompt, not a title.
            !channel && 'text-muted-foreground',
          )}
        >
          {channel?.name ?? 'Nothing playing'}
        </h1>

        <NowPlaying phase={phase} viaProxy={viaProxy} />

        {renditions.length > 1 ? (
          <PanelSelect
            aria-label="Quality"
            className="h-8 w-24"
            value={String(activeRendition)}
            onValueChange={(value) => setRendition(Number(value))}
            options={[
              { value: '-1', label: 'Auto' },
              ...renditions.map((r) => ({ value: String(r.index), label: `${r.height}p` })),
            ]}
          />
        ) : null}

        {sources.length > 1 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <Layers />
                <span className="tabular">
                  {sourceIndex + 1}/{sources.length}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-1">
              <SourceList sources={sources} sourceIndex={sourceIndex} onTune={tuneTo} />
            </PopoverContent>
          </Popover>
        ) : null}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={togglePlay}
          disabled={!live}
          aria-label={paused ? 'Play' : 'Pause'}
          title={paused ? 'Play (space)' : 'Pause (space)'}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute (m)' : 'Mute (m)'}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={togglePictureInPicture}
          disabled={!live}
          aria-label="Picture in picture"
        >
          <PictureInPicture2 />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onFullscreen} aria-label="Fullscreen">
          <Maximize2 />
        </Button>
      </div>
    </section>
  )
}
