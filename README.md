# Tuner

A self-hosted IPTV player. The server keeps the channel catalog in Postgres,
probes every stream on a schedule, and can fetch a stream on the browser's
behalf — so the list shows what actually works, and a broken address is fixed
by editing a row rather than by shipping a release.

Monorepo: React client, Fastify API, Postgres. pnpm workspaces and Turborepo.

## Why it is not a static site any more

The previous version built a JSON index at deploy time and shipped it to the
browser. That is the cheapest possible way to host this, and it has three
limits that no amount of client-side work can get past:

| Limit                    | Why a browser cannot solve it                                                                                            | What the server does                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Plain `http://` sources  | An `https` page may not fetch them. Mixed content is blocked before a request leaves the tab.                            | Fetches over http, serves over https.                                  |
| Cross-origin refusal     | No `Access-Control-Allow-Origin` means the response is discarded unread.                                                 | CORS does not apply server to server.                                  |
| Header-gated sources     | Some broadcasters answer only a particular `User-Agent` or `Referer`, and JavaScript may not set either.                 | Sets them upstream.                                                    |
| Dead sources             | Roughly half of any public list is unreachable at a given moment, and there is no way to know which half without asking. | Probes every source on a schedule and ranks the list by what answered. |
| A changed stream address | It is baked into a build artifact.                                                                                       | It is a row. `PATCH` it and the next request serves the new one.       |

The honest cost: once a stream is proxied, every byte of video crosses your
box. The client therefore tries the broadcaster directly first and only falls
back to the proxy when that cannot work — and for sources the prober has
already found to be header-gated or plain http, it goes straight to the proxy
rather than spending a failed attempt discovering it.

## Layout

```
apps/
  api/src/
    core/           env, database, errors, the admin guard, upstream fetching
    modules/
      catalog/      routes · controller · service · repository · stats
      stream/       routes · controller · service · hls · sign
      sources/      routes · controller · service · probe · classify
      imports/      routes · controller · service · m3u
      jobs/         routes · controller · service · sync · health · scheduler
    app.ts          where the modules are mounted
  web/src/          React client: the player and the channel list
packages/
  shared/           zod schemas — the one contract both sides validate against
  ui/               shadcn/ui primitives, themed, plus this app's own vocabulary
e2e/                playwright: the application driven in a real browser
deploy/             nginx vhost, pm2 ecosystem, deploy and backup scripts
.github/workflows/  the checks every push runs
```

Each backend module owns everything about itself, in four layers:

| File              | Knows about                                                   |
| ----------------- | ------------------------------------------------------------- |
| `*.routes.ts`     | paths, methods, the zod schemas, rate limits                  |
| `*.controller.ts` | request and reply — nothing that would still be true in a CLI |
| `*.service.ts`    | the rules; the module's public surface for other modules      |
| `*.repository.ts` | SQL                                                           |

Writes are mounted inside one `/admin` scope that applies the token check, so a
new admin module is protected by where it is registered rather than by
remembering to add a hook.

## Running it

Needs Node 22+, pnpm 12+ and Postgres 16+.

```sh
pnpm install
cp .env.example .env            # then fill in the two secrets it names
createdb tuner                  # or point DATABASE_URL at your own

pnpm migrate                    # create the schema
pnpm sync                       # pull iptv-org into Postgres (~25 MB, one minute)
pnpm health --limit 400         # probe a sample, so the list has liveness data

pnpm dev                        # API on :12994, client on :12995
```

The client proxies `/api`, `/stream` and `/admin` to the API in development, so
it is same-origin there exactly as in production.

### The two secrets

- `STREAM_SECRET` signs the upstream URLs inside rewritten playlists. Without
  it the segment route would relay any URL handed to it, which is an open proxy.
- `ADMIN_TOKEN` gates every write. Leave it unset and the admin API refuses
  outright rather than defaulting to open.

Generate both with `openssl rand -hex 32`.

`STREAM_TOKEN` is optional and worth setting if the deployment is reachable
from the internet: it makes the proxy yours rather than everyone's.

## The client

One screen: the picture, and the lineup beside it on a desktop or beneath it on
a phone. Nothing scrolls the page itself — the list scrolls inside its own
container, so the picture never leaves the screen and you can always see
whether what you just tapped started playing. The controls are overlaid on the
video rather than beside it, and a tap anywhere shows or hides them.

Three things in it are worth knowing about:

- **The list is virtualised.** Paging appends, every row carries a logo from
  some broadcaster's CDN, and a filtered catalog can still be thousands of
  rows. Only the rows near the viewport are in the document.
- **It installs.** `vite-plugin-pwa` gives it a manifest, an icon and a service
  worker, which is what makes it a thing on a phone's home screen rather than a
  tab. The worker precaches the shell and nothing else: the catalog is live
  data, hls.js is fetched only when someone presses play, and `/api`, `/stream`
  and `/admin` are on the navigation denylist so a segment request is never
  answered with `index.html`.
- **A render error is not a white screen.** There are error boundaries around
  the stage and around the application, so a fault in the player leaves the
  lineup usable and lets you pick something else.

## How the catalog stays correct

Two columns carry the design. `origin` records who put a row there —
`iptv-org`, `manual` or `m3u` — and `locked` records that an operator has
touched it. The nightly sync only rewrites rows where `origin = 'iptv-org' and
not locked`, so:

- a stream address corrected by hand survives tonight's pull;
- a channel added by hand is never touched at all;
- a source removed by hand is disabled rather than deleted, because a hard
  delete would simply be reinserted.

Channels and sources that vanish upstream are retired and disabled rather than
dropped, since favourites in a browser still point at the id and upstream
reinstates things often enough to matter.

## The probe sweep

`pnpm health` asks each source whether it is alive **from the server's point of
view**, which is all the proxy needs. Whether a _browser_ could fetch it
directly is a separate question, answered by recording whether the origin sent
a usable `Access-Control-Allow-Origin`. The two are stored apart, so the client
is never told to retry something that cannot work.

A source that serves a master playlist while every rendition under it 404s is
a common way for a dead stream to look alive, so the sweep follows the first
variant as well.

Results drive the list: confirmed-live sources rank first, then untried ones,
then ones that have been failing; a source written off after three consecutive
failures stops counting towards a channel being playable at all.

## API

Read:

```
GET  /api/facets                  countries, categories, languages, with counts
GET  /api/channels?q=&country=…   the list, filtered and keyset-paged
POST /api/channels/by-ids         resolve favourites and history
GET  /api/channels/:id            one channel with its sources, best first
GET  /stream/:sourceId/index.m3u8 play a source through the server
```

Write — `Authorization: Bearer $ADMIN_TOKEN`:

```
PATCH  /admin/sources/:id         change an address or its headers
DELETE /admin/sources/:id
PUT    /admin/channels            create or replace a hand-kept channel
PATCH  /admin/channels/:id
POST   /admin/channels/:id/sources
POST   /admin/probe               try an address now and report what came back
POST   /admin/import/m3u          import a playlist into its own namespace
POST   /admin/import/xtream       the same, for an Xtream Codes portal
POST   /admin/jobs/sync           pull from iptv-org now
POST   /admin/jobs/health         probe stale sources now
GET    /admin/jobs                what ran, when, and what it did
```

Both directions are validated against the same zod schemas from
`packages/shared`, so a response that does not match its own contract is an
error on the server rather than a surprise in a component.

The Settings dialog in the client is a usable front end for the parts an
operator reaches for: paste the admin token, pick a source, check an address,
save it.

## Playlist rewriting

This is where a naive stream proxy quietly fails. Relaying the manifest alone
achieves nothing — the player reads it and then goes straight to the origin for
every segment, which fails for the original reason. Every URI inside has to be
pointed back at the proxy, including the ones that are easy to miss: variant
playlists, `EXT-X-KEY` AES key blobs, `EXT-X-MAP` initialisation segments, and
the low-latency `EXT-X-PART` and `EXT-X-PRELOAD-HINT` tags. Each of those is a
test in `apps/api/tests/hls.test.ts`.

## Deploying

Live at **https://tv.quartix.in**, on a VPS it shares with four other
services. nginx terminates TLS and serves `apps/web/dist`; `/api/`, `/stream/`
and `/admin/` proxy to the Node process on port 12994, which pm2 keeps up.

```sh
ssh qp '/srv/tuner/deploy/deploy.sh'
```

That resets to `origin/main`, installs, builds, migrates, reloads pm2 and waits
for `/health`. `deploy/README.md` is the full runbook: first-time setup, the
nginx reload procedure, how to seed the catalog, and what to look at when
something is wrong.

Three proxy locations rather than one, because they want opposite things:
`/api/` is small JSON and is buffered, `/stream/` is video that must not be and
must not time out mid-programme, `/admin/` must never be cached.

Bandwidth is the thing to size for: 1080p HLS is roughly 5 Mbps, about 2.5 GB
per viewer-hour, and all of it crosses the box for proxied sources. Pick a host
whose traffic is included rather than metered, and keep `PROXY_MAX_CONCURRENT`
honest about what the box can carry.

## Checks

```sh
pnpm lint          # oxlint across the workspace
pnpm knip          # dead exports, unused dependencies
pnpm typecheck     # tsc per package
pnpm test          # vitest; tests live in each package's tests/
pnpm check         # all four
pnpm format        # prettier

pnpm e2e:install   # once: fetch the browser
pnpm e2e           # playwright, desktop and mobile
pnpm e2e:ui        # the same, with the inspector
```

Every push runs the first group, then the second, in
`.github/workflows/ci.yml`. The e2e job starts the runner's own Postgres,
syncs a real catalog into it and drives a real browser; there is no container
anywhere, here or in production.

Most of the unit suite is pure functions — playlist rewriting, M3U parsing,
failover decisions, signing, cursors, the signal-state mapping. They are the
parts with real branching in them, and they run in under two seconds.

The exception is `apps/api/tests/admin-auth.test.ts`, which builds the whole
server and injects a request at every `/admin` route it finds. That suite
exists because the admin API was once served to anyone who asked: `requireAdmin`
was registered without `fastify-plugin`, so its hooks attached to an empty
scope and protected nothing. Nothing in the code looked wrong. It discovers the
routes from the built server rather than listing them, so a new admin module is
covered the moment it is mounted.

The end-to-end suite in `e2e/` drives the real application against the real
database; it starts both dev servers if they are not already up. It asserts on
behaviour rather than on any particular channel, because the catalog is eleven
thousand strangers' streams and half of them are dead on any given day. What it
checks is that the player always _says_ which. `a11y.spec.ts` scans each screen
with axe — it is there because a hand-written test caught a filter button that
rendered with no accessible name below `md`, and writing one test per control
does not scale.

## Legal

Tuner hosts nothing of its own. It points at stream URLs published in a public
database, and the client fetches video directly from the broadcaster wherever it
can. **Once you enable the proxy, your server is retransmitting that video**,
which is a different position from the static version of this project — keep it
behind `STREAM_TOKEN` and treat it as yours rather than a public service.
Channels on the iptv-org DMCA blocklist are excluded at sync.

## Credits

Channel data from [iptv-org](https://github.com/iptv-org/api) (public domain).
Playback by [hls.js](https://github.com/video-dev/hls.js) (Apache 2.0).
Interface on [shadcn/ui](https://ui.shadcn.com) and
[Radix](https://www.radix-ui.com) (MIT). Queries through
[Kysely](https://kysely.dev) (MIT).
