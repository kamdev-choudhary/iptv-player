import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiSource, ChannelDetail, HealthReason } from '@tuner/shared'
import { streamUrlFor } from '@/api/client.ts'
import { decideNextAttempt, describeFailure, type SlateAction } from '@/lib/failover.ts'
import { Player, StreamError, type Rendition } from '@/lib/player.ts'
import { prefs } from '@/lib/prefs.ts'

/**
 * Tuning, and what to do when a source will not play.
 *
 * The order of attempts is the useful part. The API already says, per source,
 * whether a browser could fetch it at all — so a source marked `proxy` goes
 * straight through the server instead of spending a failed attempt finding
 * out, and a source marked `direct` is fetched from the broadcaster, which
 * costs the server nothing. Only when a direct attempt fails for a reason the
 * proxy could fix is the same source tried again through it.
 *
 * The attempts are a loop rather than two functions calling each other, so
 * there is one place where the next attempt is decided. That decision and the
 * slate's wording both live in `lib/failover.ts`, as pure functions — they are
 * the part with the real branching in them, and worth testing on their own.
 */

export type Phase = 'idle' | 'tuning' | 'live' | 'dead'

export type StageAction = SlateAction

export interface PlaybackState {
  phase: Phase
  head: string
  body: string
  actions: StageAction[]
  /** Index into the channel's source list. */
  sourceIndex: number
  /** Whether the current attempt is going through the server. */
  viaProxy: boolean
  renditions: Rendition[]
  activeRendition: number
  reason: HealthReason | null
}

const IDLE: PlaybackState = {
  phase: 'idle',
  head: 'No signal',
  body: 'Pick a channel from the lineup, or press / to search.',
  actions: [],
  sourceIndex: 0,
  viaProxy: false,
  renditions: [],
  activeRendition: -1,
  reason: null,
}

export interface PlaybackOptions {
  channel: ChannelDetail | null
  streamToken: string
  autoNext: boolean
  autoProxy: boolean
}

export function usePlayback({ channel, streamToken, autoNext, autoProxy }: PlaybackOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerRef = useRef<Player | null>(null)
  const [state, setState] = useState<PlaybackState>(IDLE)
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(false)

  // Async work reads these rather than closing over a stale render. Written in
  // an effect, never during render.
  const optionsRef = useRef({ streamToken, autoNext, autoProxy })
  const channelRef = useRef<ChannelDetail | null>(null)
  const sourcesRef = useRef<ApiSource[]>([])
  /** Bumped whenever a new run starts, so an older one knows to stop. */
  const runToken = useRef(0)

  useEffect(() => {
    optionsRef.current = { streamToken, autoNext, autoProxy }
  }, [streamToken, autoNext, autoProxy])

  const player = useCallback(() => {
    const video = videoRef.current
    if (!video) return null
    playerRef.current ??= new Player(video, {
      onRenditions: (renditions) => setState((s) => ({ ...s, renditions })),
      onRenditionChange: (activeRendition) => setState((s) => ({ ...s, activeRendition })),
    })
    return playerRef.current
  }, [])

  /**
   * A stable handle on `run`, so the actions a dead slate offers can restart
   * it. Assigned in an effect rather than during render.
   */
  const runRef = useRef<(index: number, viaProxy?: boolean) => void>(() => {})

  const run = useCallback(
    async (startIndex: number, startViaProxy?: boolean) => {
      const token = ++runToken.current
      const channelNow = channelRef.current
      const instance = player()
      if (!channelNow || !instance) return

      let index = startIndex
      let forceProxy = startViaProxy

      for (;;) {
        const sources = sourcesRef.current
        const source = sources[index]
        if (!source) return

        // A source the API has marked unplayable in a browser is only ever
        // fetched through the server.
        const useProxy = forceProxy ?? source.play === 'proxy'
        const url = useProxy
          ? streamUrlFor(source.proxyPath, optionsRef.current.streamToken || undefined)
          : source.url

        const position = sources.length > 1 ? ` — source ${index + 1} of ${sources.length}` : ''
        setState((s) => ({
          ...s,
          phase: 'tuning',
          sourceIndex: index,
          viaProxy: useProxy,
          head: channelNow.name,
          body: `Connecting${useProxy ? ' through the server' : ''}${position}.`,
          actions: [],
          renditions: [],
          activeRendition: -1,
          reason: null,
        }))

        let failure: HealthReason | null = null
        try {
          await instance.start(source, { url, viaProxy: useProxy })
        } catch (error) {
          failure = error instanceof StreamError ? error.reason : 'network'
        }

        // Someone tuned elsewhere while this attempt was in flight.
        if (token !== runToken.current) return

        if (!failure) {
          setState((s) => ({
            ...s,
            phase: 'live',
            head: channelNow.name,
            body: '',
            actions: [],
            reason: null,
          }))
          setPaused(false)
          return
        }

        const verdict = decideNextAttempt(
          failure,
          index,
          useProxy,
          sources.length,
          optionsRef.current,
        )
        if (verdict.next === 'retry-proxied') {
          forceProxy = true
          continue
        }
        if (verdict.next === 'advance') {
          index += 1
          forceProxy = undefined
          continue
        }

        setState((s) => ({
          ...s,
          phase: 'dead',
          ...describeFailure(failure, index, useProxy, sources.length, (at, proxied) =>
            runRef.current(at, proxied),
          ),
          renditions: [],
          activeRendition: -1,
        }))
        return
      }
    },
    [player],
  )

  useEffect(() => {
    runRef.current = (index, viaProxy) => void run(index, viaProxy)
  }, [run])
  /**
   * A new channel starts at its best source, which the API has already ranked.
   *
   * The external system being synchronised here is the video element, which is
   * what effects are for. The resets below cannot be derived during render:
   * what the stage should say depends on an attempt that has not happened yet.
   */
  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    channelRef.current = channel
    sourcesRef.current = channel?.sources ?? []
    runToken.current++

    if (!channel) {
      playerRef.current?.stop()
      setState(IDLE)
      return
    }

    prefs.addRecent(channel.id)

    if (channel.sources.length === 0) {
      setState({
        ...IDLE,
        phase: 'dead',
        head: 'Nothing to play',
        body: `No sources are listed for ${channel.name} right now.`,
      })
      return
    }

    void run(0)
  }, [channel, run])
  /* oxlint-enable react/set-state-in-effect */

  // Volume and pause live on the element, so the element is what reports them.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sync = () => {
      setMuted(video.muted)
      setPaused(video.paused)
    }
    sync()
    video.addEventListener('volumechange', sync)
    video.addEventListener('pause', sync)
    video.addEventListener('play', sync)
    return () => {
      video.removeEventListener('volumechange', sync)
      video.removeEventListener('pause', sync)
      video.removeEventListener('play', sync)
    }
  }, [])

  useEffect(() => () => playerRef.current?.stop(), [])

  const tuneTo = useCallback((index: number) => runRef.current(index), [])

  const nextSource = useCallback(() => {
    const count = sourcesRef.current.length
    if (count < 2) return
    setState((s) => {
      runRef.current((s.sourceIndex + 1) % count)
      return s
    })
  }, [])

  const setRendition = useCallback((index: number) => {
    playerRef.current?.setRendition(index)
    setState((s) => ({ ...s, activeRendition: index }))
  }, [])

  /* The element's own controls are hidden, so these are how it is driven. */

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (video) video.muted = !video.muted
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
  }, [])

  const togglePictureInPicture = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {})
    else void video.requestPictureInPicture().catch(() => {})
  }, [])

  return {
    videoRef,
    ...state,
    sources: channel?.sources ?? [],
    muted,
    paused,
    tuneTo,
    nextSource,
    setRendition,
    toggleMute,
    togglePlay,
    togglePictureInPicture,
  }
}
