import { useCallback, useEffect, useRef, useState } from 'react'
import { Player, REASONS, StreamError, type Reason, type Rendition } from '@/lib/player'
import { sourcesFor, type Catalog } from '@/lib/channels'
import { store } from '@/lib/store'
import type { Channel, Source } from '@/lib/types'

/** What the test card is saying right now. */
export type Phase = 'idle' | 'waiting' | 'tuning' | 'live' | 'dead'

export interface CardAction {
  label: string
  primary?: boolean
  run: () => void
}

export interface Playback {
  channel: Channel | null
  sources: Source[]
  index: number
  phase: Phase
  head: string
  body: string
  actions: CardAction[]
  renditions: Rendition[]
}

const IDLE: Playback = {
  channel: null,
  sources: [],
  index: 0,
  phase: 'idle',
  head: 'No signal',
  body: 'Pick a channel, or press / to search for one.',
  actions: [],
  renditions: [],
}

/** A proxy only helps where the browser, not the stream, is the obstacle. */
const PROXY_HELPS: Reason[] = ['cors', 'insecure', 'network', 'timeout', 'forbidden']

export interface PlaybackOptions {
  catalog: Catalog
  /** Opens the settings dialog, offered when a CORS failure has no proxy set. */
  onNeedProxy: () => void
}

export function usePlayback({ catalog, onNeedProxy }: PlaybackOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerRef = useRef<Player | null>(null)
  const [state, setState] = useState<Playback>(IDLE)

  // Async callbacks read these rather than closing over a stale render.
  const current = useRef<Channel | null>(null)
  const sourcesRef = useRef<Source[]>([])
  const pending = useRef<Channel | null>(null)
  const indexRef = useRef(0)
  const catalogRef = useRef(catalog)
  catalogRef.current = catalog

  const player = useCallback(() => {
    const video = videoRef.current
    if (!video) return null
    playerRef.current ??= new Player(video, {
      onRenditions: (renditions) => setState((s) => ({ ...s, renditions })),
    })
    return playerRef.current
  }, [])

  const tune = useCallback(
    async (index: number, proxy = '') => {
      const ch = current.current
      const sources = sourcesRef.current
      const source = sources[index]
      const p = player()
      if (!ch || !source || !p) return

      indexRef.current = index
      const label = sources.length > 1 ? ` — source ${index + 1} of ${sources.length}` : ''
      setState((s) => ({
        ...s,
        index,
        phase: 'tuning',
        head: 'Tuning',
        body: `Connecting to ${ch.n}${label}.`,
        actions: [],
        renditions: [],
      }))

      try {
        await p.start(source, { proxy })
        if (current.current !== ch) return
        setState((s) => ({ ...s, phase: 'live', head: ch.n, body: '', actions: [] }))
      } catch (err) {
        if (current.current !== ch) return
        const reason = err instanceof StreamError ? err.reason : 'network'
        fail(reason, index, proxy)
      }
    },
    [player],
  )

  // `tune` and `fail` call each other; a ref breaks the cycle.
  const tuneRef = useRef(tune)
  tuneRef.current = tune

  function fail(reason: Reason, index: number, usedProxy: string) {
    const info = REASONS[reason] ?? REASONS.network
    const settings = store.settings
    const sources = sourcesRef.current
    const remaining = sources.length - index - 1
    const proxyHelps = PROXY_HELPS.includes(reason)

    if (settings.autoProxy && settings.proxy && proxyHelps && !usedProxy) {
      void tuneRef.current(index, settings.proxy)
      return
    }
    if (settings.autoNext && remaining > 0) {
      void tuneRef.current(index + 1)
      return
    }

    const actions: CardAction[] = []
    if (remaining > 0) {
      actions.push({
        label: `Try source ${index + 2}`,
        primary: true,
        run: () => void tuneRef.current(index + 1),
      })
    }
    if (settings.proxy && proxyHelps && !usedProxy) {
      actions.push({
        label: 'Retry through proxy',
        run: () => void tuneRef.current(index, settings.proxy),
      })
    }
    if (!settings.proxy && reason === 'cors') {
      actions.push({ label: 'Set up a proxy', run: onNeedProxy })
    }
    actions.push({ label: 'Retry', run: () => void tuneRef.current(index, usedProxy) })

    const tail =
      remaining > 0
        ? ` ${remaining} other ${remaining === 1 ? 'source' : 'sources'} listed for this channel.`
        : ' This was the last source listed.'

    setState((s) => ({
      ...s,
      phase: 'dead',
      head: info.head,
      body: info.body + tail,
      actions,
    }))
  }

  const open = useCallback(
    (ch: Channel) => {
      const cat = catalogRef.current
      if (!ch.s && !cat.sourcesReady) {
        // Someone pressed play before sources.json landed; queue it.
        pending.current = ch
        setState({
          ...IDLE,
          channel: ch,
          phase: 'waiting',
          head: 'Tuning',
          body: `Loading the source list for ${ch.n}…`,
        })
        return
      }

      const sources = sourcesFor(cat, ch)
      current.current = ch
      sourcesRef.current = sources
      store.addRecent(ch.i)
      indexRef.current = 0
      setState({ ...IDLE, channel: ch, sources, phase: 'tuning' })
      void tune(0)
    },
    [tune],
  )

  // Flush a channel someone asked for before the source list arrived.
  useEffect(() => {
    if (catalog.sourcesReady && pending.current) {
      const ch = pending.current
      pending.current = null
      open(ch)
    }
  }, [catalog.sourcesReady, open])

  const nextSource = useCallback(() => {
    const count = sourcesRef.current.length
    if (count < 2) return
    void tuneRef.current((indexRef.current + 1) % count)
  }, [])

  const setRendition = useCallback((index: number) => {
    playerRef.current?.setRendition(index)
  }, [])

  useEffect(() => () => playerRef.current?.stop(), [])

  return {
    videoRef,
    ...state,
    open,
    tune: (index: number) => void tuneRef.current(index),
    nextSource,
    setRendition,
  }
}
