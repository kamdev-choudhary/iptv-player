import type { TallyState } from '@tuner/ui'
import type { ApiChannel, ApiSource } from '@tuner/shared'

/**
 * Turning what the server knows into the mark the panel shows.
 *
 * This is the one place the four tally states are decided, so a dot in the
 * lineup and a dot in the source strip can never disagree about the same
 * source.
 */

/** Failures after which a source is written off rather than treated as flaky. */
const DEAD_AFTER_FAILURES = 3

export function sourceTally(source: ApiSource): TallyState {
  if (source.dash) return 'off'
  const health = source.health
  if (!health) return 'hold'
  // A live source that a browser cannot fetch itself is still live; saying so
  // in violet is more useful than calling it a fault.
  if (health.ok) return source.play === 'proxy' ? 'routed' : 'live'
  return health.failures >= DEAD_AFTER_FAILURES ? 'fault' : 'hold'
}

export function channelTally(channel: ApiChannel): TallyState {
  if (channel.liveCount > 0) return 'live'
  if (channel.playableCount > 0) return 'hold'
  if (channel.sourceCount > 0) return 'fault'
  return 'off'
}

/** One line summarising a channel's sources, for the row's title attribute. */
export function channelSummary(channel: ApiChannel): string {
  if (!channel.sourceCount) return 'No sources listed'
  if (channel.liveCount > 0) {
    return `${channel.liveCount} of ${channel.sourceCount} sources live at the last check`
  }
  if (channel.playableCount > 0) return `${channel.playableCount} sources not yet checked`
  return `All ${channel.sourceCount} sources failing`
}

/** Fallback mark for a channel with no logo, or one whose logo fails to load. */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return '?'
  const mark = words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[1]![0]}`
  return mark.toUpperCase()
}

/**
 * A stable hue per channel, so a name always comes back the same colour. The
 * spread is narrow and desaturated on purpose: these are placeholders behind a
 * dense list, not decoration competing with the picture.
 */
export function markHue(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997
  return `oklch(0.42 0.045 ${(hash % 360).toFixed(0)})`
}

/** `1080p`, or an em dash when the resolution is not known. */
export function heightLabel(height: number | null): string {
  return height ? `${height}p` : '—'
}

/** Latency as an instrument would print it. */
export function latencyLabel(ms: number | null): string {
  if (ms === null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}
