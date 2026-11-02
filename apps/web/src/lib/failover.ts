import { REASON_COPY, type HealthReason } from '@tuner/shared'
import { DETERMINISTIC, PROXY_HELPS } from './player.ts'

/**
 * What to do when a source will not play.
 *
 * Pure functions, deliberately outside the playback hook: this is the part
 * with the actual decisions in it, and it is worth being able to test every
 * branch without a video element.
 */

export interface FailoverOptions {
  /** Retry the same source through the server when that could help. */
  autoProxy: boolean
  /** Move to the next source when this one is beyond help. */
  autoNext: boolean
}

export type Verdict =
  /** Same source, but routed through the server this time. */
  | { next: 'retry-proxied' }
  /** This source is beyond help; try the one after it. */
  | { next: 'advance' }
  /** Nothing automatic left to try. Show the slate. */
  | { next: 'give-up' }

export function decideNextAttempt(
  reason: HealthReason,
  index: number,
  usedProxy: boolean,
  count: number,
  options: FailoverOptions,
): Verdict {
  const proxyCouldHelp = PROXY_HELPS.includes(reason) && !usedProxy

  // The server is a different client with different rules, so it gets the
  // first retry — before giving up on this source and moving to the next.
  if (options.autoProxy && proxyCouldHelp) return { next: 'retry-proxied' }
  if (options.autoNext && index + 1 < count) return { next: 'advance' }
  return { next: 'give-up' }
}

export interface SlateAction {
  label: string
  primary?: boolean
  run: () => void
}

export interface SlateCopy {
  head: string
  body: string
  reason: HealthReason
  actions: SlateAction[]
}

/**
 * The slate's wording and its ways out. Every action offered has to be able to
 * change the outcome — a retry button for a failure that is a fixed property
 * of the source is a dead end dressed up as a way out.
 */
export function describeFailure(
  reason: HealthReason,
  index: number,
  usedProxy: boolean,
  count: number,
  retry: (index: number, viaProxy?: boolean) => void,
): SlateCopy {
  const copy = REASON_COPY[reason] ?? REASON_COPY.network
  const remaining = count - index - 1
  const proxyCouldHelp = PROXY_HELPS.includes(reason) && !usedProxy

  const actions: SlateAction[] = []
  if (remaining > 0) {
    actions.push({
      label: `Try source ${index + 2}`,
      primary: true,
      run: () => retry(index + 1),
    })
  }
  if (proxyCouldHelp) {
    actions.push({ label: 'Play through the server', run: () => retry(index, true) })
  }
  if (!DETERMINISTIC.includes(reason)) {
    actions.push({ label: 'Try again', run: () => retry(index, usedProxy) })
  }

  const tail =
    remaining > 0
      ? ` ${remaining} other ${remaining === 1 ? 'source' : 'sources'} listed for this channel.`
      : ' This was the last source listed.'

  return { head: copy.head, body: copy.body + tail, reason, actions }
}
