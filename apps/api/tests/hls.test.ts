import { describe, expect, it } from 'vitest'
import { bestHeight, isMasterPlaylist, parseVariants, rewriteManifest } from '../src/lib/hls.ts'

/**
 * Playlist rewriting is where a stream proxy quietly fails: miss one URI kind
 * and playback breaks in a way that looks like a dead source. Each test here
 * is one of the URI kinds a real HLS playlist can carry.
 */

const link = (url: string, kind: 'manifest' | 'segment') =>
  `/p/${kind === 'manifest' ? 'm' : 's'}?u=${encodeURIComponent(url)}`

const rewrite = (text: string, baseUrl = 'https://cdn.example/live/master.m3u8') =>
  rewriteManifest(text, { baseUrl, link })

describe('rewriteManifest', () => {
  it('points variant playlists at the manifest route', () => {
    const out = rewrite(
      ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360', '360p.m3u8'].join('\n'),
    )
    expect(out).toContain('/p/m?u=https%3A%2F%2Fcdn.example%2Flive%2F360p.m3u8')
  })

  it('points media segments at the segment route', () => {
    const out = rewrite(['#EXTM3U', '#EXTINF:6.0,', 'seg-1.ts'].join('\n'))
    expect(out).toContain('/p/s?u=https%3A%2F%2Fcdn.example%2Flive%2Fseg-1.ts')
  })

  it('resolves relative, root-relative and absolute URIs alike', () => {
    const out = rewrite(
      ['#EXTM3U', '#EXTINF:6,', '../a.ts', '#EXTINF:6,', '/b.ts', '#EXTINF:6,', 'https://other.example/c.ts'].join(
        '\n',
      ),
    )
    expect(out).toContain(encodeURIComponent('https://cdn.example/a.ts'))
    expect(out).toContain(encodeURIComponent('https://cdn.example/b.ts'))
    expect(out).toContain(encodeURIComponent('https://other.example/c.ts'))
  })

  it('rewrites the AES key URI, without which playback cannot decrypt', () => {
    const out = rewrite(
      ['#EXTM3U', '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x0', '#EXTINF:6,', 'seg.ts'].join('\n'),
    )
    expect(out).toContain('URI="/p/s?u=https%3A%2F%2Fcdn.example%2Flive%2Fkey.bin"')
  })

  it('leaves METHOD=NONE alone, which carries no URI', () => {
    const out = rewrite(['#EXTM3U', '#EXT-X-KEY:METHOD=NONE'].join('\n'))
    expect(out).toContain('#EXT-X-KEY:METHOD=NONE')
  })

  it('rewrites the initialisation segment in fMP4 streams', () => {
    const out = rewrite(['#EXTM3U', '#EXT-X-MAP:URI="init.mp4"', '#EXTINF:6,', 'seg.m4s'].join('\n'))
    expect(out).toContain('URI="/p/s?u=https%3A%2F%2Fcdn.example%2Flive%2Finit.mp4"')
  })

  it('treats an EXT-X-MEDIA rendition as a playlist, not a segment', () => {
    const out = rewrite(
      ['#EXTM3U', '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio/en.m3u8"'].join('\n'),
    )
    expect(out).toContain('URI="/p/m?u=https%3A%2F%2Fcdn.example%2Flive%2Faudio%2Fen.m3u8"')
  })

  it('rewrites the low-latency partial-segment tags', () => {
    const out = rewrite(
      [
        '#EXTM3U',
        '#EXT-X-PART:DURATION=1.0,URI="part-1.ts"',
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part-2.ts"',
        '#EXT-X-RENDITION-REPORT:URI="../720p/index.m3u8",LAST-MSN=42',
      ].join('\n'),
    )
    expect(out).toContain('URI="/p/s?u=https%3A%2F%2Fcdn.example%2Flive%2Fpart-1.ts"')
    expect(out).toContain('URI="/p/s?u=https%3A%2F%2Fcdn.example%2Flive%2Fpart-2.ts"')
    expect(out).toContain('URI="/p/m?u=https%3A%2F%2Fcdn.example%2F720p%2Findex.m3u8"')
  })

  it('does not treat a bare URI after a non-variant tag as a playlist', () => {
    const out = rewrite(
      ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=1', 'a.m3u8', '#EXTINF:6,', 'b.ts'].join('\n'),
    )
    expect(out).toContain('/p/m?u=https%3A%2F%2Fcdn.example%2Flive%2Fa.m3u8')
    expect(out).toContain('/p/s?u=https%3A%2F%2Fcdn.example%2Flive%2Fb.ts')
  })

  it('preserves every tag line and the line count', () => {
    const input = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6', '#EXTINF:6,', 'a.ts', '#EXT-X-ENDLIST']
    const out = rewrite(input.join('\n'))
    expect(out.split('\n')).toHaveLength(input.length)
    expect(out).toContain('#EXT-X-VERSION:3')
    expect(out).toContain('#EXT-X-ENDLIST')
  })

  it('leaves a URI it cannot resolve untouched rather than dropping it', () => {
    const out = rewriteManifest(['#EXTM3U', '#EXTINF:6,', 'seg.ts'].join('\n'), {
      baseUrl: 'not a url',
      link,
    })
    expect(out).toContain('seg.ts')
  })

  it('survives CRLF line endings', () => {
    const out = rewrite('#EXTM3U\r\n#EXTINF:6,\r\nseg.ts\r\n')
    expect(out).toContain('/p/s?u=https%3A%2F%2Fcdn.example%2Flive%2Fseg.ts')
  })
})

describe('playlist inspection', () => {
  const master = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
    '360p.m3u8',
    '#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=4000000,RESOLUTION=1920x1080',
    '1080p.m3u8',
  ].join('\n')

  it('recognises a master playlist', () => {
    expect(isMasterPlaylist(master)).toBe(true)
    expect(isMasterPlaylist('#EXTM3U\n#EXTINF:6,\nseg.ts')).toBe(false)
  })

  it('reads resolutions and bandwidths off the variants', () => {
    expect(parseVariants(master)).toEqual([
      { height: 360, bandwidth: 800000 },
      { height: 1080, bandwidth: 4000000 },
    ])
  })

  it('reports the best height, which beats the published quality label', () => {
    expect(bestHeight(master)).toBe(1080)
    expect(bestHeight('#EXTM3U\n#EXTINF:6,\nseg.ts')).toBeNull()
  })
})
