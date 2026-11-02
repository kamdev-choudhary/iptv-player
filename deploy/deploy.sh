#!/usr/bin/env bash
#
# Deploys whatever is on origin/main. Builds on the box: this is a Vite and
# tsup build of a few hundred files, which takes under a minute and saves
# carrying a CI artifact pipeline for it.
#
#   ssh qp '/srv/tuner/deploy/deploy.sh'
#   ssh qp '/srv/tuner/deploy/deploy.sh --no-migrate'

set -Eeuo pipefail

APP_DIR="/srv/tuner"
PM2_APP="tuner-api"
PORT=12994
HEALTH_URL="http://127.0.0.1:${PORT}/health"
HEALTH_TRIES=30

# Everything the build must produce. packages/* are absent on purpose: they
# export TypeScript source and are bundled into the two apps.
BUILT=(apps/api/dist apps/web/dist)

migrate=true
for arg in "$@"; do
  case "$arg" in
    --no-migrate) migrate=false ;;
    *) echo "unknown option: $arg (only --no-migrate)" >&2; exit 2 ;;
  esac
done

step() { echo "▸ $*"; }

cd "$APP_DIR"

step "Fetching origin/main..."
git fetch --prune origin main

# Hard reset rather than stash: the box holds nothing worth keeping, and
# stashes pile up one per deploy and are never popped. .env is untracked and
# survives this.
step "Resetting to origin/main..."
git reset --hard origin/main
echo "  now at $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"

step "Installing dependencies..."
pnpm install --frozen-lockfile

step "Building..."
pnpm build

for built in "${BUILT[@]}"; do
  if [ ! -d "$built" ]; then
    echo "✗ $built is missing — the build did not produce what it should" >&2
    exit 1
  fi
done

if $migrate; then
  # Separate from the boot-time migration so a failure stops the deploy here,
  # with the old process still serving, rather than in a restart loop.
  step "Migrating the database..."
  pnpm migrate
fi

step "Reloading $PM2_APP..."
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 reload "$PM2_APP" --update-env
else
  pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
fi
pm2 save --force >/dev/null

step "Waiting for health..."
for try in $(seq 1 "$HEALTH_TRIES"); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "  healthy after ${try}s"
    step "Deployed $(git rev-parse --short HEAD)."
    exit 0
  fi
  sleep 1
done

echo "✗ $PM2_APP did not come up — pm2 logs $PM2_APP --lines 50" >&2
exit 1
