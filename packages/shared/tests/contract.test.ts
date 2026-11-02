import { describe, expect, it } from 'vitest'
import { channelQuery, m3uImport, sourceInput, streamUrl } from '../src/index.ts'

/**
 * The contract is the one place the client and the API have to agree, so these
 * tests pin the coercions that happen at the boundary — querystrings arrive as
 * strings, and a field that may repeat arrives as either a string or an array.
 */

describe('channelQuery', () => {
  it('coerces the numeric and boolean fields a querystring sends as text', () => {
    const parsed = channelQuery.parse({ minHeight: '720', liveOnly: 'true', limit: '20' })
    expect(parsed).toMatchObject({ minHeight: 720, liveOnly: true, limit: 20 })
  })

  it('applies defaults when nothing is asked for', () => {
    expect(channelQuery.parse({})).toMatchObject({ sort: 'name', limit: 60 })
  })

  it('accepts one category or several, and always yields an array', () => {
    expect(channelQuery.parse({ category: 'news' }).category).toEqual(['news'])
    expect(channelQuery.parse({ category: ['news', 'sports'] }).category).toEqual(['news', 'sports'])
  })

  it('upper-cases a country code so the filter matches what is stored', () => {
    expect(channelQuery.parse({ country: 'in' }).country).toBe('IN')
  })

  it('refuses a limit beyond what one page should ever return', () => {
    expect(channelQuery.safeParse({ limit: '5000' }).success).toBe(false)
  })

  it('refuses an unknown sort key rather than falling back silently', () => {
    expect(channelQuery.safeParse({ sort: 'random' }).success).toBe(false)
  })
})

describe('streamUrl', () => {
  it('accepts http and https', () => {
    expect(streamUrl.parse('http://a.example/s.m3u8')).toBe('http://a.example/s.m3u8')
    expect(streamUrl.parse('https://a.example/s.m3u8')).toBe('https://a.example/s.m3u8')
  })

  it('refuses a scheme the proxy could not fetch', () => {
    for (const bad of ['rtmp://a/live', 'file:///etc/passwd', 'javascript:alert(1)', 'a.example/s']) {
      expect(streamUrl.safeParse(bad).success).toBe(false)
    }
  })

  it('trims surrounding whitespace, which pasted URLs carry', () => {
    expect(streamUrl.parse('  https://a.example/s.m3u8  ')).toBe('https://a.example/s.m3u8')
  })
})

describe('sourceInput', () => {
  it('takes the headers a browser cannot set', () => {
    const parsed = sourceInput.parse({
      url: 'https://a.example/s.m3u8',
      userAgent: 'SmartTV/1.0',
      referrer: 'https://portal.example/',
    })
    expect(parsed).toMatchObject({ userAgent: 'SmartTV/1.0', referrer: 'https://portal.example/' })
  })

  it('requires a URL, since there is nothing to store without one', () => {
    expect(sourceInput.safeParse({ quality: '1080p' }).success).toBe(false)
  })
})

describe('m3uImport', () => {
  it('takes a URL or a body, but not both and not neither', () => {
    expect(m3uImport.safeParse({ url: 'https://a/p.m3u', namespace: 'mine' }).success).toBe(true)
    expect(m3uImport.safeParse({ body: '#EXTM3U', namespace: 'mine' }).success).toBe(true)
    expect(m3uImport.safeParse({ namespace: 'mine' }).success).toBe(false)
    expect(
      m3uImport.safeParse({ url: 'https://a/p.m3u', body: '#EXTM3U', namespace: 'mine' }).success,
    ).toBe(false)
  })

  it('refuses a namespace that would not be safe in a channel id', () => {
    expect(m3uImport.safeParse({ body: '#EXTM3U', namespace: 'My Namespace' }).success).toBe(false)
    expect(m3uImport.safeParse({ body: '#EXTM3U', namespace: 'my-ns-2' }).success).toBe(true)
  })
})
