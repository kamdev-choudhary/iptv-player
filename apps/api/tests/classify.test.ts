import { describe, expect, it } from 'vitest'
import {
  flagsFor,
  heightOf,
  looksLikeHls,
  playModeFor,
} from '../src/modules/sources/sources.classify.ts'
import { decodeCursor, encodeCursor } from '../src/core/cursor.ts'

describe('flagsFor', () => {
  it('flags plain http, which an https page may not fetch', () => {
    expect(flagsFor('http://a.example/s.m3u8')).toMatchObject({ insecure: true })
    expect(flagsFor('https://a.example/s.m3u8')).toMatchObject({ insecure: false })
  })

  it('flags a source needing headers a browser cannot set', () => {
    expect(flagsFor('https://a/s.m3u8', 'SmartTV/1.0')).toMatchObject({ needsHeaders: true })
    expect(flagsFor('https://a/s.m3u8', null, 'https://r/')).toMatchObject({ needsHeaders: true })
    expect(flagsFor('https://a/s.m3u8')).toMatchObject({ needsHeaders: false })
  })

  it('flags MPEG-DASH, including with a query string', () => {
    expect(flagsFor('https://a/s.mpd')).toMatchObject({ isDash: true })
    expect(flagsFor('https://a/s.mpd?t=1')).toMatchObject({ isDash: true })
    expect(flagsFor('https://a/s.m3u8')).toMatchObject({ isDash: false })
  })
})

describe('heightOf', () => {
  it('reads the pixel height off a published label', () => {
    expect(heightOf('1080p')).toBe(1080)
    expect(heightOf('720')).toBe(720)
    expect(heightOf('576i')).toBe(576)
  })

  it('returns null for a label with no usable height', () => {
    expect(heightOf(null)).toBeNull()
    expect(heightOf('')).toBeNull()
    expect(heightOf('HD')).toBeNull()
    // Out of range for video, so almost certainly not a resolution.
    expect(heightOf('9999p')).toBeNull()
  })
})

describe('playModeFor', () => {
  const plain = { insecure: false, needsHeaders: false, isDash: false }

  it('sends a plain https source direct', () => {
    expect(playModeFor(plain, false)).toBe('direct')
  })

  it('routes anything structurally impossible in a browser through the proxy', () => {
    expect(playModeFor({ ...plain, insecure: true }, false)).toBe('proxy')
    expect(playModeFor({ ...plain, needsHeaders: true }, false)).toBe('proxy')
  })

  it('routes a source known to refuse cross-origin reads through the proxy', () => {
    expect(playModeFor(plain, true)).toBe('proxy')
  })
})

describe('looksLikeHls', () => {
  it('treats an extensionless URL as HLS, which most sources are', () => {
    expect(looksLikeHls('https://a.example/live/stream')).toBe(true)
    expect(looksLikeHls('https://a.example/s.m3u8?t=1')).toBe(true)
  })

  it('recognises the formats that are not HLS', () => {
    expect(looksLikeHls('https://a.example/s.mpd')).toBe(false)
    expect(looksLikeHls('https://a.example/v.mp4')).toBe(false)
  })
})

describe('cursor', () => {
  it('round-trips a position', () => {
    const cursor = { v: 1080, n: 'BBC One', i: 'BBCOne.uk' }
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
  })

  it('treats a missing, corrupt or hand-edited cursor as the first page', () => {
    expect(decodeCursor(undefined)).toBeNull()
    expect(decodeCursor('not-a-cursor')).toBeNull()
    expect(decodeCursor(Buffer.from('{"v":"nope"}').toString('base64url'))).toBeNull()
  })
})
