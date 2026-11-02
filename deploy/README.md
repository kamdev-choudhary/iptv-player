# Deploying Tuner

Runs on the shared box at `140.238.251.143` (`ssh qp`), alongside q-pathshala,
vayu, pixo and project-mate. Everything here follows what those already do, so
there is one shape to learn rather than five.

| | |
| --- | --- |
| Domain | `tv.quartix.in` |
| Repo | `/srv/tuner`, owned by `ubuntu` |
| Process | pm2 `tuner-api`, port **12994** |
| Database | Postgres `tuner`, role `tuner` |
| Secrets | `/srv/tuner/.env` (0600), `/srv/tuner-keys/` |
| Web | nginx serves `/srv/tuner/apps/web/dist` |

Ports on this box are five digits, one per service: vayu 12992, pixo 12993,
tuner 12994. Nothing listens on a default port, so two services can never
quietly collide.

## Routine deploy

```sh
ssh qp '/srv/tuner/deploy/deploy.sh'
```

It resets to `origin/main`, installs, builds, migrates, reloads pm2 and waits
for `/health`. `--no-migrate` skips the migration step.

The build happens on the box. It is a Vite and tsup build of a few hundred
files and takes under a minute, which is cheaper than maintaining a CI artifact
pipeline for it.

## What the files here are

- **`nginx.conf`** → `/etc/nginx/sites-available/tuner.conf`, symlinked into
  `sites-enabled`. Three proxy blocks, because they want opposite things:
  `/api/` is small JSON and is buffered, `/stream/` is video that must not be
  buffered and must not time out mid-programme, `/admin/` must never be cached.
  Everything else is the SPA.
- **`ecosystem.config.cjs`** → the pm2 app. Secrets come from `/srv/tuner/.env`
  via node's own `--env-file-if-exists`; the values set in `env` here override
  the file, which is what makes them the deployment's decision.
- **`deploy.sh`** → the routine deploy above.

After editing `nginx.conf`:

```sh
scp deploy/nginx.conf qp:/tmp/tuner.conf
ssh qp 'sudo cp /tmp/tuner.conf /etc/nginx/sites-available/tuner.conf && sudo nginx -t && sudo systemctl reload nginx'
```

`nginx -t` validates **every** site on the box. Never reload without it: a bad
file here takes the other four domains down with it.

## First-time setup, for reference

```sh
# database
sudo -u postgres createuser tuner --pwprompt
sudo -u postgres createdb -O tuner tuner
sudo -u postgres psql -d tuner -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm'

# code
sudo install -d -o ubuntu -g ubuntu /srv/tuner
git clone git@github-tuner:kamdev-choudhary/iptv-player.git /srv/tuner

# secrets — openssl rand -hex 32 for each
vim /srv/tuner/.env && chmod 600 /srv/tuner/.env

# certificate, before nginx can reference it
sudo certbot certonly --webroot -w /var/www/certbot -d tv.quartix.in

# nginx, then pm2
sudo cp deploy/nginx.conf /etc/nginx/sites-available/tuner.conf
sudo ln -sfn /etc/nginx/sites-available/tuner.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

cd /srv/tuner && pnpm install --frozen-lockfile && pnpm build && pnpm migrate
pm2 start deploy/ecosystem.config.cjs && pm2 save
```

The repo must stay world-readable (`chmod -R u=rwX,go=rX /srv/tuner`): nginx
runs as `www-data` and has to traverse into `apps/web/dist`. Re-tighten `.env`
to 0600 afterwards.

### The GitHub deploy key

`~/.ssh/github_tuner` on the box, with a `github-tuner` host alias in
`~/.ssh/config`. Add the public half to the repo's **Settings → Deploy keys**
(read-only is enough) and point the remote at it:

```sh
git -C /srv/tuner remote set-url origin git@github-tuner:kamdev-choudhary/iptv-player.git
```

## Filling the catalog

Both jobs also run on a schedule inside `tuner-api` — a sync at 05:30 UTC and a
probe sweep every six hours — so this is only for the first load or a hurry.

```sh
ssh qp 'cd /srv/tuner && pnpm sync'
```

A full sweep takes around twenty minutes, which is longer than an SSH session
should be held open, so detach it:

```sh
ssh qp 'cd /srv/tuner && nohup setsid pnpm health --stale-hours 0 --limit 18500 --concurrency 32 > /tmp/tuner-health.log 2>&1 < /dev/null &'
ssh qp 'tail -f /tmp/tuner-health.log'
```

## Checking on it

```sh
ssh qp 'pm2 logs tuner-api --lines 50'
ssh qp 'curl -s localhost:12994/health'
ssh qp 'curl -s localhost:12994/stream/_capacity'   # open upstreams
curl -s https://tv.quartix.in/api/facets | head -c 200
```

`/stream/_capacity` is the one to watch under load: `available` falling to zero
means the proxy is at its cap and viewers are queuing for a permit.

## Bandwidth

Every proxied byte of video crosses this box — roughly 2.5 GB per viewer-hour
at 1080p, and this box also serves four other sites. `PROXY_MAX_CONCURRENT` is
set to 60 for that reason. The client only uses the proxy when a direct fetch
cannot work, so most playback costs nothing here; if that stops being true,
lower the cap before the box notices.

`STREAM_TOKEN` is empty, which leaves the proxy open to anyone who finds the
domain. Set it, and put the same value into the player's Settings, to make the
proxy yours.
