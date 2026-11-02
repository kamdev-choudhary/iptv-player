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
 * The tones a logo-less channel falls back to.
 *
 * A curated set rather than a hue rotation. Rotating the full circle walks
 * through olive, mustard and brick, which made an earlier list look muddy; a
 * first attempt at fixing it leaned too far the other way and came out almost
 * entirely green. These six sit at one lightness, in the cool half of the
 * wheel plus a single rose, far enough apart to tell neighbouring rows apart
 * and close enough to read as one family.
 */
const MARK_TONES = [
  'oklch(0.42 0.055 258)', // indigo
  'oklch(0.42 0.05 228)', // blue
  'oklch(0.42 0.045 202)', // teal
  'oklch(0.42 0.055 300)', // violet
  'oklch(0.42 0.05 348)', // rose
  'oklch(0.42 0.035 268)', // slate
] as const

/** Stable per name, so a channel always comes back the same colour. */
export function markTone(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997
  return MARK_TONES[hash % MARK_TONES.length]!
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
