import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../../core/env.ts'

/**
 * Rewritten playlists carry upstream URLs in their query string, so the
 * segment route would otherwise relay anything asked of it. Each URL is signed
 * against the source it came from: a signature minted for one source cannot be
 * replayed on another, and one not minted here is not accepted at all.
 */
const SIG_LENGTH = 32

function digest(sourceId: number, url: string) {
  return createHmac('sha256', env.STREAM_SECRET)
    .update(`${sourceId}\n${url}`)
    .digest('base64url')
    .slice(0, SIG_LENGTH)
}

export function sign(sourceId: number, url: string) {
  return digest(sourceId, url)
}

export function verify(sourceId: number, url: string, signature: string) {
  if (typeof signature !== 'string' || signature.length !== SIG_LENGTH) return false
  const expected = Buffer.from(digest(sourceId, url))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export const encodeUrl = (url: string) => Buffer.from(url, 'utf8').toString('base64url')

export function decodeUrl(encoded: string): string | null {
  try {
    const url = Buffer.from(encoded, 'base64url').toString('utf8')
    return /^https?:\/\//i.test(url) ? url : null
  } catch {
    return null
  }
}
