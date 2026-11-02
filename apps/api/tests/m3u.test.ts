import { describe, expect, it } from 'vitest'
import { parseM3u, slug } from '../src/lib/m3u.ts'

/**
 * Real playlists are inconsistent in specific, repeated ways, and each of
 * those ways is a test here. The header is optional, repeated names mean
 * alternative sources rather than duplicates, and the headers a stream insists
 * on arrive in three different notations.
 */

describe('parseM3u', () => {
  it('reads name, logo, country, language and group off EXTINF', () => {
    const [channel] = parseM3u(
      [
        '#EXTM3U',
        '#EXTINF:-1 tvg-name="NDTV 24x7" tvg-logo="https://l/ndtv.png" tvg-country="IN;US" tvg-language="Hindi" group-title="News",NDTV',
        'https://cdn.example/ndtv.m3u8',
      ].join('\n'),
    )

    expect(channel).toMatchObject({
      name: 'NDTV 24x7',
      logo: 'https://l/ndtv.png',
      country: 'IN',
      language: 'Hindi',
      categories: ['News'],
    })
    expect(channel?.sources).toHaveLength(1)
  })

  it('falls back to the title after the comma when tvg-name is absent', () => {
    const [channel] = parseM3u('#EXTM3U\n#EXTINF:-1,Zee News\nhttps://cdn.example/a.m3u8')
    expect(channel?.name).toBe('Zee News')
  })

  it('groups a repeated name into one channel with several sources', () => {
    const channels = parseM3u(
      [
        '#EXTM3U',
        '#EXTINF:-1,Star Plus',
        'https://a.example/1.m3u8',
        '#EXTINF:-1,Star Plus',
        'https://b.example/2.m3u8',
      ].join('\n'),
    )
    expect(channels).toHaveLength(1)
    expect(channels[0]?.sources.map((s) => s.url)).toEqual([
      'https://a.example/1.m3u8',
      'https://b.example/2.m3u8',
    ])
  })

  it('does not record the same address twice', () => {
    const channels = parseM3u(
      ['#EXTM3U', '#EXTINF:-1,A', 'https://a.example/1.m3u8', '#EXTINF:-1,A', 'https://a.example/1.m3u8'].join('\n'),
    )
    expect(channels[0]?.sources).toHaveLength(1)
  })

  it('reads the headers a stream demands from EXTVLCOPT', () => {
    const [channel] = parseM3u(
      [
        '#EXTM3U',
        '#EXTINF:-1,Gated',
        '#EXTVLCOPT:http-user-agent=SmartTV/1.0',
        '#EXTVLCOPT:http-referrer=https://portal.example/',
        'https://cdn.example/gated.m3u8',
      ].join('\n'),
    )
    expect(channel?.sources[0]).toMatchObject({
      userAgent: 'SmartTV/1.0',
      referrer: 'https://portal.example/',
    })
  })

  it('reads the same headers from EXTHTTP json', () => {
    const [channel] = parseM3u(
      [
        '#EXTM3U',
        '#EXTINF:-1,Gated',
        '#EXTHTTP:{"User-Agent":"Dalvik/2.1","Referer":"https://p.example/"}',
        'https://cdn.example/gated.m3u8',
      ].join('\n'),
    )
    expect(channel?.sources[0]).toMatchObject({
      userAgent: 'Dalvik/2.1',
      referrer: 'https://p.example/',
    })
  })

  it('splits headers appended to the URL with a pipe, which are not part of the address', () => {
    const [channel] = parseM3u(
      ['#EXTM3U', '#EXTINF:-1,Piped', 'https://cdn.example/s.m3u8|User-Agent=VLC&Referer=https://r.example/'].join(
        '\n',
      ),
    )
    expect(channel?.sources[0]).toEqual({
      url: 'https://cdn.example/s.m3u8',
      userAgent: 'VLC',
      referrer: 'https://r.example/',
    })
  })

  it('prefers a piped header over the preceding EXTVLCOPT', () => {
    const [channel] = parseM3u(
      [
        '#EXTM3U',
        '#EXTINF:-1,Both',
        '#EXTVLCOPT:http-user-agent=FromOpt',
        'https://cdn.example/s.m3u8|User-Agent=FromPipe',
      ].join('\n'),
    )
    expect(channel?.sources[0]?.userAgent).toBe('FromPipe')
  })

  it('does not carry one entry’s headers over to the next', () => {
    const channels = parseM3u(
      [
        '#EXTM3U',
        '#EXTINF:-1,First',
        '#EXTVLCOPT:http-user-agent=OnlyFirst',
        'https://a.example/1.m3u8',
        '#EXTINF:-1,Second',
        'https://b.example/2.m3u8',
      ].join('\n'),
    )
    expect(channels[0]?.sources[0]?.userAgent).toBe('OnlyFirst')
    expect(channels[1]?.sources[0]?.userAgent).toBeNull()
  })

  it('parses a playlist with no #EXTM3U header, which providers often omit', () => {
    const channels = parseM3u('#EXTINF:-1,A\nhttps://a.example/1.m3u8')
    expect(channels).toHaveLength(1)
  })

  it('ignores non-http lines and unknown directives', () => {
    const channels = parseM3u(
      ['#EXTM3U', '#EXT-X-SOMETHING:1', '#EXTINF:-1,A', 'rtmp://a.example/live', 'https://a.example/1.m3u8'].join(
        '\n',
      ),
    )
    expect(channels[0]?.sources.map((s) => s.url)).toEqual(['https://a.example/1.m3u8'])
  })

  it('drops a country code that is not two letters', () => {
    const [channel] = parseM3u(
      '#EXTM3U\n#EXTINF:-1 tvg-country="International",A\nhttps://a.example/1.m3u8',
    )
    expect(channel?.country).toBeNull()
  })

  it('returns nothing for a file with no entries', () => {
    expect(parseM3u('#EXTM3U\n')).toEqual([])
  })
})

describe('slug', () => {
  it('folds accents and punctuation into a stable key', () => {
    expect(slug('Télé Québec HD!')).toBe('tele-quebec-hd')
  })

  it('does not leave leading or trailing dashes', () => {
    expect(slug('  ***News***  ')).toBe('news')
  })
})
