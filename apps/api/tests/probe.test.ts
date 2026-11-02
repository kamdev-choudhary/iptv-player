import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeSource } from '../src/modules/sources/sources.probe.ts'

/**
 * A sweep runs for an hour over tens of thousands of strangers' servers, so
 * the thing that matters most about the prober is that nothing it meets can
 * make it throw. A failure has to come back as a reason.
 */

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

/** A Response whose body rejects partway through, as a dropped stream does. */
function respondingWith(
  body: ReadableStream<Uint8Array> | string,
  headers: Record<string, string> = {},
) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/vnd.apple.mpegurl', ...headers },
  })
}

describe('probeSource', () => {
  it('reports a reason rather than throwing when the body fails mid-read', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('#EXTM3U\n'))
        controller.error(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
      },
    })
    globalThis.fetch = vi.fn().mockResolvedValue(respondingWith(body))

    const result = await probeSource({ url: 'https://a.example/s.m3u8' })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('timeout')
  })

  it('reports a reason when the connection never opens', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND a.example'))
    const result = await probeSource({ url: 'https://a.example/s.m3u8' })
    expect(result).toMatchObject({ ok: false, reason: 'network' })
  })

  it('maps an upstream status onto the reason it means', async () => {
    const cases = [
      [404, 'gone'],
      [403, 'forbidden'],
      [500, 'network'],
    ] as const
    for (const [status, reason] of cases) {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status }))
      const result = await probeSource({ url: 'https://a.example/s.m3u8' })
      expect(result).toMatchObject({ ok: false, reason, status })
    }
  })

  it('calls a header-gated 403 what it is, rather than geo-blocking', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 403 }))
    const result = await probeSource({ url: 'https://a.example/s.m3u8', userAgent: 'SmartTV/1.0' })
    expect(result.reason).toBe('headers')
  })

  it('refuses DASH without opening a connection', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    const result = await probeSource({ url: 'https://a.example/s.mpd' })
    expect(result).toMatchObject({ ok: false, reason: 'dash' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the best height out of a master playlist', async () => {
    const master = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
      '360p.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080',
      '1080p.m3u8',
    ].join('\n')
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(respondingWith(master, { 'access-control-allow-origin': '*' }))

    // `deep: false` keeps this to the one request under test.
    const result = await probeSource({ url: 'https://a.example/s.m3u8', deep: false })
    expect(result).toMatchObject({ ok: true, reason: 'ok', height: 1080, cors: true })
    expect(result.variants).toHaveLength(2)
  })

  it('records that a browser could not read it when the origin sends no CORS header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(respondingWith('#EXTM3U\n#EXTINF:6,\na.ts'))
    const result = await probeSource({ url: 'https://a.example/s.m3u8', deep: false })
    expect(result).toMatchObject({ ok: true, cors: false })
  })

  it('calls a non-playlist response what it is', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(respondingWith('<html>this stream has moved</html>'))
    const result = await probeSource({ url: 'https://a.example/s.m3u8', deep: false })
    expect(result).toMatchObject({ ok: false, reason: 'notstream' })
  })
})
