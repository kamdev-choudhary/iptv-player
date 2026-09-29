/**
 * Reads an extended M3U playlist into the same channel shape the bundled index
 * uses, so a personal lineup browses and plays exactly like the public one.
 */

const ATTR = /([\w-]+)="([^"]*)"/g

function attrs (line) {
  const out = {}
  for (const [, k, v] of line.matchAll(ATTR)) out[k.toLowerCase()] = v
  return out
}

function slug (s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

export function parseM3U (text) {
  const lines = text.split(/\r?\n/)
  if (!lines.some(l => l.trim().startsWith('#EXTM3U'))) {
    // Not fatal: some providers omit the header. Only bail if there is no URL at all.
    if (!lines.some(l => /^https?:\/\//i.test(l.trim()))) {
      throw new Error('That file has no playlist entries in it.')
    }
  }

  const channels = []
  const seen = new Map()
  let pending = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('#EXTINF:')) {
      const a = attrs(line)
      const title = line.slice(line.lastIndexOf(',') + 1).trim()
      pending = {
        name: a['tvg-name'] || title || 'Untitled channel',
        logo: a['tvg-logo'] || null,
        group: a['group-title'] || null,
        country: (a['tvg-country'] || '').split(';')[0].toUpperCase() || null,
        language: (a['tvg-language'] || '').split(';')[0] || null
      }
      continue
    }

    // Directives other than EXTINF carry no per-channel data we use.
    if (line.startsWith('#')) continue
    if (!/^https?:\/\//i.test(line)) continue

    const meta = pending || { name: 'Untitled channel', logo: null, group: null, country: null, language: null }
    pending = null

    const source = { u: line }
    if (line.startsWith('http://')) source.x = 1
    if (/\.mpd(\?|$)/i.test(line)) source.d = 1

    // Repeated names are alternative sources for one channel, not duplicates.
    const key = slug(meta.name) || slug(line)
    if (seen.has(key)) {
      seen.get(key).s.push(source)
      continue
    }

    const channel = {
      i: `pl:${key}`,
      n: meta.name,
      s: [source],
      k: 1,
      p: 1 // came from a user playlist
    }
    if (meta.logo) channel.o = meta.logo
    if (meta.country) channel.c = meta.country
    if (meta.group) channel.g = [meta.group]
    if (meta.language) channel.l = [meta.language]

    seen.set(key, channel)
    channels.push(channel)
  }

  if (!channels.length) throw new Error('That file has no playlist entries in it.')

  for (const c of channels) {
    c.k = c.s.length
    if (c.s.every(s => s.x || s.d)) c.x = 1
  }
  return channels
}
