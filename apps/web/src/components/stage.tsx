import type { RefObject } from 'react'
import { useState } from 'react'
import {
  Check,
  ExternalLink,
  Layers,
  Link2,
  Maximize2,
  MoreVertical,
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Readout,
  Tally,
  cn,
} from '@tuner/ui'
import type { ApiSource, ChannelDetail } from '@tuner/shared'
import { heightLabel, latencyLabel, sourceTally } from '@/lib/signal.ts'
import { useActivity } from '@/hooks/use-idle.ts'
import type { PlaybackState, StageAction } from '@/hooks/use-playback.ts'
import type { Rendition } from '@/lib/player.ts'
import { Slate } from './slate.tsx'

/**
 * The picture, with its controls drawn over it.
 *
 * They used to sit in a strip underneath, which cost a row of height on every
 * screen and most of the list on a phone. Over the video they cost nothing
 * until someone moves, which is how every player people already know behaves.
 * Everything beyond play, sound and size lives in the overflow menu — source,
 * quality, and the two links out.
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
  const [menuOpen, setMenuOpen] = useState(false)
  const live = phase === 'live'
  // The overlay hides only over a moving picture. With nothing playing there is
  // nothing for it to be in the way of.
  const { active, wake } = useActivity(2600, menuOpen || !live)
  const showControls = active

  const statusLabel =
    phase === 'live'
      ? viaProxy
        ? 'Playing via server'
        : 'Playing'
      : phase === 'dead'
        ? 'Not playing'
        : phase === 'tuning'
          ? 'Connecting'
          : null

  const copyLink = () => {
    if (!channel) return
    const url = `${window.location.origin}/#c=${encodeURIComponent(channel.id)}`
    void navigator.clipboard?.writeText(url).catch(() => {})
  }

  return (
    <section
      aria-label="Player"
      className="group/stage relative h-full min-h-0 overflow-hidden rounded-xl bg-black"
      onPointerMove={wake}
      onPointerLeave={() => !menuOpen && undefined}
      onFocus={wake}
    >
      <video
        ref={videoRef}
        playsInline
        controls={false}
        muted={muted}
        onClick={live ? togglePlay : undefined}
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

      {/* The control bar. A gradient rather than a panel, so it darkens the
          picture enough to read against without becoming a second surface. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 px-2 pt-10 pb-2',
          'bg-gradient-to-t from-black/85 via-black/45 to-transparent',
          'transition-opacity duration-200',
          showControls ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="pointer-events-auto flex w-full items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={togglePlay}
            disabled={!live}
            aria-label={paused ? 'Play' : 'Pause'}
            title={paused ? 'Play (space)' : 'Pause (space)'}
            className="text-white hover:bg-white/15 hover:text-white"
          >
            {paused ? <Play /> : <Pause />}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute (m)' : 'Mute (m)'}
            className="text-white hover:bg-white/15 hover:text-white"
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>

          <div className="ml-1 flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 truncate text-small text-white">
              {channel?.name ?? 'Nothing playing'}
            </span>
            {statusLabel ? (
              <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <Tally state={live ? 'live' : phase === 'dead' ? 'fault' : 'hold'} />
                <span
                  className={cn(
                    'text-micro',
                    live ? 'text-live' : phase === 'dead' ? 'text-fault' : 'text-white/70',
                  )}
                >
                  {statusLabel}
                </span>
              </span>
            ) : null}
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onFullscreen}
            aria-label="Fullscreen"
            title="Fullscreen (f)"
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <Maximize2 />
          </Button>

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More options"
                className="text-white hover:bg-white/15 hover:text-white"
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-60">
              {/* Sources: the main thing an operator reaches for, and the thing
                  that carries the telemetry the server collected. */}
              {sources.length > 1 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Layers />
                    <span className="flex-1">Source</span>
                    <Readout value={`${sourceIndex + 1}/${sources.length}`} />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto">
                    {sources.map((source, index) => (
                      <DropdownMenuItem key={source.id} onSelect={() => tuneTo(index)}>
                        <Tally state={sourceTally(source)} />
                        <span className="min-w-0 flex-1 truncate">{sourceLabel(source)}</span>
                        {source.play === 'proxy' ? <Badge variant="routed">server</Badge> : null}
                        <Readout value={heightLabel(source.height)} />
                        <Readout value={latencyLabel(source.health?.latencyMs ?? null)} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}

              {renditions.length > 1 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Check className="opacity-0" />
                    <span className="flex-1">Quality</span>
                    <Readout
                      value={
                        activeRendition >= 0
                          ? heightLabel(renditions[activeRendition]?.height ?? null)
                          : 'Auto'
                      }
                    />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    <DropdownMenuItem onSelect={() => setRendition(-1)}>
                      <Check className={cn(activeRendition < 0 ? 'opacity-100' : 'opacity-0')} />
                      Auto
                    </DropdownMenuItem>
                    {renditions.map((rendition) => (
                      <DropdownMenuItem
                        key={rendition.index}
                        onSelect={() => setRendition(rendition.index)}
                      >
                        <Check
                          className={cn(
                            activeRendition === rendition.index ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {rendition.height}p
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}

              {sources.length > 1 || renditions.length > 1 ? <DropdownMenuSeparator /> : null}

              <DropdownMenuItem onSelect={togglePictureInPicture} disabled={!live}>
                <PictureInPicture2 />
                Picture in picture
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={copyLink} disabled={!channel}>
                <Link2 />
                Copy link to channel
              </DropdownMenuItem>

              {channel?.website ? (
                <DropdownMenuItem asChild>
                  <a href={channel.website} target="_blank" rel="noreferrer noopener">
                    <ExternalLink />
                    Broadcaster&rsquo;s site
                  </a>
                </DropdownMenuItem>
              ) : null}

              {channel ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="font-normal text-muted-foreground">
                    {channel.liveCount} of {channel.sourceCount} sources live at the last check
                  </DropdownMenuLabel>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </section>
  )
}
