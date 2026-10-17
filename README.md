# Tuner

A browser IPTV player for the publicly listed channels in the
[iptv-org](https://github.com/iptv-org/iptv) database — search roughly 11,000 channels
from 178 countries, and watch the ones your browser is able to reach. React, Vite,
Tailwind and [shadcn/ui](https://ui.shadcn.com), built to a static site — no backend, no
tracking, deployed to GitHub Pages.

**Live: https://kamdev-choudhary.github.io/iptv-player/**

## What it does

- **Search and filter** by name, country, language, category and minimum resolution.
- **Plays HLS** through [hls.js](https://github.com/video-dev/hls.js), with a rendition
  picker, picture-in-picture, and keyboard control.
- **Falls over automatically.** Most channels list several sources. When one dies, Tuner
  moves to the next and tells you why the last one failed.
- **Your own playlists.** Load an M3U file and it browses and plays like the built-in list.
  Playlists, favourites and history stay in `localStorage`.
- **Shareable links.** `#c=<channel-id>` opens straight into a channel.
- **Remembers how you left it.** Country, language, quality, categories and sort order come
  back on the next visit, alongside favourites, history and playlists.

Three panes: filters on the left, the picture in the middle, the lineup on the right — so
choosing what to watch never costs you sight of what you are watching. Below 1280px they
stack.

Keyboard: `/` search · `⌘K` jump to a channel · `space` play/pause · `m` mute ·
`f` fullscreen · `n` next source.

## The honest part: why streams fail

These are public streams from hundreds of unrelated broadcasters, and **a browser is the
most restricted place to play them**. Expect roughly half of any public list to be dead or
unreachable at a given moment. Tuner names the specific cause rather than showing a generic
error, because the causes need different fixes:

| What you see | What is happening | Can it be fixed? |
| --- | --- | --- |
| Broadcaster refused the browser | The server is up but sends no `Access-Control-Allow-Origin`, so the browser discards the response. | Yes — with a CORS proxy (below). |
| Blocked by the browser | The source is `http://` and the page is `https://`. Mixed content is not allowed. | Yes — via a proxy, or run Tuner locally over http. |
| Stream needs a desktop player | The source only answers requests with a particular `User-Agent` or `Referer`. JavaScript is forbidden from setting either header. | No. Use VLC or mpv. |
| Source is gone / not responding | 404, or the host does not resolve. | No. Try another source. |
| Not available here | The server refused, usually geo-blocking. | Only with a VPN. |
| Format not supported | MPEG-DASH. Tuner plays HLS, which is 96% of the list. | No. |

Around 1,100 of the 17,000 sources need headers a browser cannot send, so they are ranked
last and labelled instead of silently failing.

### Using a CORS proxy

Settings takes a proxy prefix, for example `https://your-proxy.example/?url=`. The stream
URL is appended, URL-encoded. Tuner offers it as a retry, or uses it automatically if you
turn that on. Run your own — public proxies see every channel you watch, and are rate
limited or hostile often enough not to rely on.

## Running it locally

Served over `http://` rather than `https://`, `http://` sources play too, which is a
meaningful chunk of the list.

```sh
npm install
npm run data     # refresh public/data/channels.json and public/data/sources.json
npm run dev      # vite dev server
```

`npm run build` writes the static site to `dist/`, and `npm run preview` serves it.

### Layout

```
src/
  lib/        store, M3U parser, hls.js wrapper, search and filter — no React
  hooks/      catalog loading, playback and failover, persisted state
  components/ the interface; components/ui holds the shadcn primitives
scripts/      build-data.mjs, which writes public/data
```

Everything in `src/lib` is framework-free and testable on its own; `src/lib/player.ts`
turns the many ways a public stream can fail into one named reason, which is what the
test card reads out.

## How the data is built

`scripts/build-data.mjs` pulls the eight iptv-org API endpoints (~25 MB) and merges them
into two files the browser can afford to load:

- `public/data/channels.json` — one compact record per channel with a logo, country,
  categories, languages, best available resolution and source count. Renders the lineup on
  its own.
- `public/data/sources.json` — channel id to its list of stream URLs. Fetched in parallel,
  needed only once you press play.

Together about 0.9 MB gzipped, down from 25 MB. Closed, NSFW and DMCA-blocklisted channels
are dropped; sources are ordered so the ones a browser can actually play come first.

A GitHub Actions workflow refreshes the data, builds the site and redeploys daily at 05:30
UTC, so it tracks upstream without anyone touching it. The committed `public/data/` files
are a snapshot so a fresh clone works offline.

## Deploying your own

Fork it, then set **Settings → Pages → Source** to **GitHub Actions**. The workflow in
`.github/workflows/pages.yml` handles the rest. Update the URL at the top of this file.

## Legal

Tuner hosts and rebroadcasts nothing. It is a client that points at stream URLs published
in a public database, and every byte of video is fetched by your browser directly from the
broadcaster. Availability and the right to watch a given channel are between you and
whoever operates it. Channels on the iptv-org DMCA blocklist are excluded from the build.

## Credits

Channel data from [iptv-org](https://github.com/iptv-org/api) (public domain). Playback by
[hls.js](https://github.com/video-dev/hls.js) (Apache 2.0). Interface built on
[shadcn/ui](https://ui.shadcn.com) and [Radix](https://www.radix-ui.com) (MIT). The palette
is SMPTE colour bars — the card a channel shows when it has nothing to broadcast.
