#!/usr/bin/env node
/**
 * Builds the channel index the player loads at runtime.
 *
 * The iptv-org API ships ~25 MB across seven files, which is far too much to
 * fetch in a browser. This merges them into one compact file (short keys,
 * shared lookup tables) holding only channels that actually have a stream.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const API = 'https://iptv-org.github.io/api'
const OUT = new URL('../data/', import.meta.url)

const ENDPOINTS = ['channels', 'streams', 'feeds', 'logos', 'categories', 'countries', 'languages', 'blocklist']

async function fetchJson (name) {
  const res = await fetch(`${API}/${name}.json`)
  if (!res.ok) throw new Error(`${name}.json -> HTTP ${res.status}`)
  const data = await res.json()
  console.log(`  ${name}.json`.padEnd(20), String(data.length).padStart(7), 'records')
  return data
}

/** Pixel height of a quality string, for ranking sources best-first. */
function qualityRank (q) {
  const m = /^(\d+)/.exec(q || '')
  return m ? Number(m[1]) : 0
}

/** Prefer the logo most likely to render: in use, square-ish, raster over SVG. */
function pickLogo (logos) {
  return logos.slice().sort((a, b) => {
    if (a.in_use !== b.in_use) return a.in_use ? -1 : 1
    const fmt = f => (f === 'SVG' ? 1 : 0)
    if (fmt(a.format) !== fmt(b.format)) return fmt(a.format) - fmt(b.format)
    return (b.width || 0) - (a.width || 0)
  })[0]?.url || null
}

function slug (s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

console.log('Fetching iptv-org API')
const [channels, streams, feeds, logos, categories, countries, languages, blocklist] =
  await Promise.all(ENDPOINTS.map(fetchJson))

// Channels removed for DMCA or flagged NSFW are excluded outright.
const blocked = new Set(blocklist.map(b => b.channel))

const logosBy = new Map()
for (const l of logos) {
  if (!l.url) continue
  if (!logosBy.has(l.channel)) logosBy.set(l.channel, [])
  logosBy.get(l.channel).push(l)
}

const feedsBy = new Map()
for (const f of feeds) {
  if (!feedsBy.has(f.channel)) feedsBy.set(f.channel, new Map())
  feedsBy.get(f.channel).set(f.id, f)
}

const streamsBy = new Map()
const orphans = []
for (const s of streams) {
  if (!s.url || !/^https?:\/\//i.test(s.url)) continue
  if (s.channel && blocked.has(s.channel)) continue
  if (!s.channel) { orphans.push(s); continue }
  if (!streamsBy.has(s.channel)) streamsBy.set(s.channel, [])
  streamsBy.get(s.channel).push(s)
}

/**
 * Compact one stream, flagging the three things that decide whether a browser
 * can play it at all:
 *   x — http, which an https page is not allowed to load
 *   h — needs a User-Agent or Referer that JavaScript is forbidden to set
 *   d — MPEG-DASH, which hls.js does not handle
 */
function packStream (s, feed) {
  const out = { u: s.url }
  if (s.quality) out.q = s.quality
  if (feed && !feed.is_main) out.f = feed.name
  if (s.labels?.length) out.b = s.labels
  if (s.url.startsWith('http://')) out.x = 1
  if (s.user_agent || s.referrer) out.h = 1
  if (/\.mpd(\?|$)/i.test(s.url)) out.d = 1
  return out
}

/** What the grid needs to know about a channel's sources without loading them. */
function summarize (packed) {
  const out = { k: packed.length }
  const best = packed.reduce((hi, s) => Math.max(hi, qualityRank(s.q)), 0)
  if (best) out.q = best
  if (packed.every(s => s.x || s.h || s.d)) out.x = 1 // nothing here a browser can play
  return out
}

/** Sources a browser cannot play go last, then best resolution, then fewest caveats. */
function bySuitability (a, b) {
  const blocked = s => (s.x ? 1 : 0) + (s.h ? 1 : 0) + (s.d ? 1 : 0)
  return blocked(a) - blocked(b) ||
    qualityRank(b.q) - qualityRank(a.q) ||
    (a.b?.length || 0) - (b.b?.length || 0)
}

const usedCategories = new Set()
const usedCountries = new Set()
const usedLanguages = new Set()
const out = []
const sources = Object.create(null)

for (const ch of channels) {
  if (ch.closed || ch.replaced_by || ch.is_nsfw || blocked.has(ch.id)) continue
  const mine = streamsBy.get(ch.id)
  if (!mine?.length) continue

  const chFeeds = feedsBy.get(ch.id)
  const packed = mine.map(s => packStream(s, chFeeds?.get(s.feed))).sort(bySuitability)

  const langs = [...new Set([...(chFeeds?.values() || [])].flatMap(f => f.languages || []))]
  const entry = { i: ch.id, n: ch.name, ...summarize(packed) }
  sources[ch.id] = packed
  if (ch.country) { entry.c = ch.country; usedCountries.add(ch.country) }
  if (ch.categories?.length) { entry.g = ch.categories; ch.categories.forEach(c => usedCategories.add(c)) }
  if (langs.length) { entry.l = langs.slice(0, 4); entry.l.forEach(l => usedLanguages.add(l)) }
  const logo = pickLogo(logosBy.get(ch.id) || [])
  if (logo) entry.o = logo
  if (ch.alt_names?.length) entry.a = ch.alt_names.slice(0, 3)
  if (ch.website) entry.w = ch.website
  out.push(entry)
}

// Streams the database has not matched to a channel yet still carry a usable
// title, so they are searchable rather than dropped.
const orphansBy = new Map()
for (const s of orphans) {
  const key = s.title || s.url
  if (!orphansBy.has(key)) orphansBy.set(key, [])
  orphansBy.get(key).push(s)
}
for (const [title, group] of orphansBy) {
  const id = `x:${slug(title)}`
  if (sources[id]) continue
  const packed = group.map(s => packStream(s, null)).sort(bySuitability)
  sources[id] = packed
  // u: no database entry behind it
  out.push({ i: id, n: title, u: 1, ...summarize(packed) })
}

out.sort((a, b) => a.n.localeCompare(b.n, 'en'))

const pick = (list, keep, fn) => Object.fromEntries(list.filter(x => keep.has(x.code ?? x.id)).map(fn))

const generated = new Date().toISOString()

// Split in two so the grid can render from `channels.json` while the larger
// `sources.json` is still in flight.
const index = {
  generated,
  source: 'https://github.com/iptv-org/api',
  countries: pick(countries, usedCountries, c => [c.code, [c.name, c.flag]]),
  categories: pick(categories, usedCategories, c => [c.id, c.name]),
  languages: pick(languages, usedLanguages, l => [l.code, l.name]),
  channels: out
}

await mkdir(OUT, { recursive: true })
const report = []
for (const [file, payload] of [['channels.json', index], ['sources.json', { generated, sources }]]) {
  const json = JSON.stringify(payload)
  await writeFile(new URL(file, OUT), json)
  report.push(`  ${file.padEnd(14)} ${(json.length / 1e6).toFixed(2)} MB raw / ${(gzipSync(json).length / 1e6).toFixed(2)} MB gzipped`)
}

console.log(`\nchannels        ${out.length}`)
console.log(`  browser-ready ${out.filter(c => !c.x).length}`)
console.log(`  unplayable    ${out.filter(c => c.x).length}`)
console.log(`sources         ${Object.values(sources).reduce((n, s) => n + s.length, 0)}`)
console.log(`countries       ${Object.keys(index.countries).length}`)
console.log(report.join('\n'))
