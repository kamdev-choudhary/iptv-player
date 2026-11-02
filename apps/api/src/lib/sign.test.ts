import { describe, expect, it } from 'vitest'
import { decodeUrl, encodeUrl, sign, verify } from './sign.ts'

/**
 * The signature is the only thing standing between the segment route and an
 * open proxy, so the tests that matter are the ones that try to get past it.
 */
describe('proxy URL signing', () => {
  const url = 'https://cdn.example/live/seg-1.ts?token=abc'

  it('accepts a signature it minted for the same source and URL', () => {
    expect(verify(42, url, sign(42, url))).toBe(true)
  })

  it('rejects a signature minted for a different source', () => {
    expect(verify(43, url, sign(42, url))).toBe(false)
  })

  it('rejects a signature minted for a different URL', () => {
    expect(verify(42, 'https://evil.example/anything', sign(42, url))).toBe(false)
  })

  it('rejects a tampered signature of the right length', () => {
    const good = sign(42, url)
    const tampered = `${good.slice(0, -1)}${good.at(-1) === 'A' ? 'B' : 'A'}`
    expect(verify(42, url, tampered)).toBe(false)
  })

  it('rejects an empty or short signature without throwing', () => {
    expect(verify(42, url, '')).toBe(false)
    expect(verify(42, url, 'short')).toBe(false)
  })

  it('rejects a non-string signature, which can arrive from a query string', () => {
    expect(verify(42, url, undefined as unknown as string)).toBe(false)
  })
})

describe('URL encoding', () => {
  it('round-trips a URL with a query string and unicode', () => {
    const url = 'https://cdn.example/канал/seg.ts?a=1&b=2'
    expect(decodeUrl(encodeUrl(url))).toBe(url)
  })

  it('refuses anything that is not http or https', () => {
    expect(decodeUrl(encodeUrl('file:///etc/passwd'))).toBeNull()
    expect(decodeUrl(encodeUrl('javascript:alert(1)'))).toBeNull()
  })

  it('returns null for input that is not valid base64url', () => {
    expect(decodeUrl('!!!not base64!!!')).toBeNull()
  })
})
