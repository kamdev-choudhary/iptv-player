import { describe, expect, it } from 'vitest'
import type { ApiChannel, ApiSource, SourceHealth } from '@tuner/shared'
import {
  channelSummary,
  channelTally,
  heightLabel,
  initials,
  latencyLabel,
  sourceTally,
} from '@/lib/signal.ts'

/**
 * The tally mark is the one device the whole panel is built on, so the mapping
 * from what the server knows to which mark is shown has to be exact — a dot
 * that lies is worse than no dot.
 */

const health = (patch: Partial<SourceHealth> = {}): SourceHealth => ({
  ok: true,
  checkedAt: '2026-11-02T00:00:00.000Z',
  reason: 'ok',
  status: 200,
  latencyMs: 120,
  height: 1080,
  cors: true,
  failures: 0,
  ...patch,
})

const source = (patch: Partial<ApiSource> = {}): ApiSource => ({
  id: 1,
  url: 'https://cdn.example/s.m3u8',
  quality: '1080p',
  height: 1080,
  feed: null,
  labels: [],
  play: 'direct',
  insecure: false,
  needsHeaders: false,
  dash: false,
  proxyPath: '/stream/1/index.m3u8',
  health: health(),
  ...patch,
})

const channel = (patch: Partial<ApiChannel> = {}): ApiChannel => ({
  id: 'BBCOne.uk',
  name: 'BBC One',
  altNames: [],
  country: 'GB',
  categories: [],
  languages: [],
  logo: null,
  website: null,
  origin: 'iptv-org',
  sourceCount: 3,
  liveCount: 2,
  playableCount: 3,
  bestHeight: 1080,
  ...patch,
})

describe('sourceTally', () => {
  it('shows live for a source the server reached and a browser can fetch', () => {
    expect(sourceTally(source())).toBe('live')
  })

  it('shows routed for a live source that only plays through the server', () => {
    expect(sourceTally(source({ play: 'proxy' }))).toBe('routed')
  })

  it('shows hold for a source nobody has tried yet', () => {
    expect(sourceTally(source({ health: null }))).toBe('hold')
  })

  it('shows hold for a source that has failed once or twice, not a fault', () => {
    expect(sourceTally(source({ health: health({ ok: false, failures: 1 }) }))).toBe('hold')
    expect(sourceTally(source({ health: health({ ok: false, failures: 2 }) }))).toBe('hold')
  })

  it('shows fault once a source has been failing persistently', () => {
    expect(sourceTally(source({ health: health({ ok: false, failures: 3 }) }))).toBe('fault')
  })

  it('shows off for DASH, which this player cannot play at all', () => {
    expect(sourceTally(source({ dash: true }))).toBe('off')
  })
})

describe('channelTally', () => {
  it('shows live when at least one source answered', () => {
    expect(channelTally(channel({ liveCount: 1 }))).toBe('live')
  })

  it('shows hold when sources remain worth trying but none is confirmed', () => {
    expect(channelTally(channel({ liveCount: 0, playableCount: 2 }))).toBe('hold')
  })

  it('shows fault when every source has been written off', () => {
    expect(channelTally(channel({ liveCount: 0, playableCount: 0, sourceCount: 2 }))).toBe('fault')
  })

  it('shows off when there are no sources at all', () => {
    expect(channelTally(channel({ liveCount: 0, playableCount: 0, sourceCount: 0 }))).toBe('off')
  })
})

describe('channelSummary', () => {
  it('states the live count against the total', () => {
    expect(channelSummary(channel())).toBe('2 of 3 sources live at the last check')
  })

  it('says what is pending when nothing is confirmed', () => {
    expect(channelSummary(channel({ liveCount: 0 }))).toBe('3 sources not yet checked')
  })

  it('says plainly when everything is failing', () => {
    expect(channelSummary(channel({ liveCount: 0, playableCount: 0 }))).toBe(
      'All 3 sources failing',
    )
  })

  it('says when there is nothing listed', () => {
    expect(channelSummary(channel({ sourceCount: 0 }))).toBe('No sources listed')
  })
})

describe('labels', () => {
  it('prints a resolution, or an em dash when unknown', () => {
    expect(heightLabel(720)).toBe('720p')
    expect(heightLabel(null)).toBe('—')
  })

  it('prints latency in the unit that keeps it short', () => {
    expect(latencyLabel(42)).toBe('42ms')
    expect(latencyLabel(999)).toBe('999ms')
    expect(latencyLabel(1500)).toBe('1.5s')
    expect(latencyLabel(null)).toBe('—')
  })

  it('builds initials from the first two words', () => {
    expect(initials('BBC One')).toBe('BO')
    expect(initials('NDTV')).toBe('ND')
    expect(initials('Télé Québec')).toBe('TQ')
  })

  it('does not fall over on a name with no letters', () => {
    expect(initials('!!!')).toBe('?')
    expect(initials('')).toBe('?')
  })
})
