import { describe, expect, it, vi } from 'vitest'
import { decideNextAttempt, describeFailure } from './failover.ts'

/**
 * The order of attempts is the thing most worth getting right: it decides
 * whether a channel plays, and whether a failure costs the server bandwidth it
 * did not need to spend.
 */

const both = { autoProxy: true, autoNext: true }
const neither = { autoProxy: false, autoNext: false }

describe('decideNextAttempt', () => {
  it('retries through the server before giving up on a source', () => {
    // CORS is a browser rule, not a broken stream, so the server can fix it.
    expect(decideNextAttempt('cors', 0, false, 3, both)).toEqual({ next: 'retry-proxied' })
  })

  it('does not retry through the server twice', () => {
    expect(decideNextAttempt('cors', 0, true, 3, both)).toEqual({ next: 'advance' })
  })

  it('moves on without a proxy attempt for a failure the proxy cannot fix', () => {
    // The stream is gone; routing the request differently will not find it.
    expect(decideNextAttempt('gone', 0, false, 3, both)).toEqual({ next: 'advance' })
    expect(decideNextAttempt('notstream', 0, false, 3, both)).toEqual({ next: 'advance' })
    expect(decideNextAttempt('dash', 0, false, 3, both)).toEqual({ next: 'advance' })
  })

  it('gives up on the last source rather than running off the end', () => {
    expect(decideNextAttempt('gone', 2, false, 3, both)).toEqual({ next: 'give-up' })
  })

  it('gives up immediately when both automatic steps are off', () => {
    expect(decideNextAttempt('cors', 0, false, 3, neither)).toEqual({ next: 'give-up' })
  })

  it('still tries the proxy when only that is enabled', () => {
    expect(decideNextAttempt('cors', 0, false, 3, { autoProxy: true, autoNext: false })).toEqual({
      next: 'retry-proxied',
    })
  })

  it('treats a header-gated source as the proxy’s job', () => {
    expect(decideNextAttempt('headers', 0, false, 2, both)).toEqual({ next: 'retry-proxied' })
  })

  it('treats a plain http source as the proxy’s job', () => {
    expect(decideNextAttempt('insecure', 0, false, 2, both)).toEqual({ next: 'retry-proxied' })
  })
})

describe('describeFailure', () => {
  const retry = vi.fn()

  it('offers the next source first when there is one', () => {
    const slate = describeFailure('gone', 0, false, 3, retry)
    expect(slate.actions[0]).toMatchObject({ label: 'Try source 2', primary: true })
    expect(slate.body).toContain('2 other sources listed')
  })

  it('says so plainly when there is nothing left', () => {
    const slate = describeFailure('gone', 2, false, 3, retry)
    expect(slate.body).toContain('This was the last source listed')
    expect(slate.actions.some((a) => a.label.startsWith('Try source'))).toBe(false)
  })

  it('offers the server when it could help and has not been tried', () => {
    const slate = describeFailure('cors', 0, false, 1, retry)
    expect(slate.actions.map((a) => a.label)).toContain('Play through the server')
  })

  it('does not offer the server twice', () => {
    const slate = describeFailure('cors', 0, true, 1, retry)
    expect(slate.actions.map((a) => a.label)).not.toContain('Play through the server')
  })

  it('offers no retry for a failure that will repeat identically', () => {
    for (const reason of ['dash', 'unsupported', 'insecure', 'headers'] as const) {
      const slate = describeFailure(reason, 0, true, 1, retry)
      expect(slate.actions.map((a) => a.label)).not.toContain('Try again')
    }
  })

  it('offers a retry for a failure that might not repeat', () => {
    const slate = describeFailure('timeout', 0, true, 1, retry)
    expect(slate.actions.map((a) => a.label)).toContain('Try again')
  })

  it('wires each action to the attempt it promises', () => {
    retry.mockClear()
    const slate = describeFailure('cors', 1, false, 4, retry)
    for (const action of slate.actions) action.run()
    expect(retry.mock.calls).toEqual([
      [2], // the next source
      [1, true], // this source, through the server
      [1, false], // this source again, as it was
    ])
  })

  it('pluralises the remaining count', () => {
    expect(describeFailure('gone', 1, false, 3, retry).body).toContain('1 other source listed')
    expect(describeFailure('gone', 0, false, 3, retry).body).toContain('2 other sources listed')
  })

  it('carries the reason through for the slate to print', () => {
    expect(describeFailure('forbidden', 0, false, 1, retry).reason).toBe('forbidden')
    expect(describeFailure('forbidden', 0, false, 1, retry).head).toBe('Not available here')
  })
})
