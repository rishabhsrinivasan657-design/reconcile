#!/usr/bin/env bash
# Deploy a commit on the server (run by `pnpm deploy:up` through Session Manager, as root).
# Usage: update.sh <commit-sha>
set -euo pipefail

COMMIT="${1:?usage: update.sh <commit-sha>}"
APP_DIR=/opt/reconcile
ENV_FILE=/etc/reconcile/.env

cd "$APP_DIR"
echo "==> Fetching $COMMIT"
git fetch --quiet --depth 1 origin "$COMMIT"
git checkout --quiet --force FETCH_HEAD

compose() { docker compose -f deploy/docker-compose.prod.yml --env-file "$ENV_FILE" "$@"; }
tools() { compose run --rm -T tools "$@"; }

echo "==> Building the app image (a few minutes on a small server)"
compose build --quiet

echo "==> Starting the database and Redis"
compose up -d --wait postgres redis

echo "==> Migrating the database (as the owner)"
tools sh -c 'DATABASE_URL="$OWNER_DATABASE_URL" pnpm --silent --filter @reconcile/db exec prisma migrate deploy'

echo "==> App database user: no edits to history (ADR-0005)"
tools sh -c 'DATABASE_URL="$OWNER_DATABASE_URL" pnpm --silent --filter @reconcile/db app-role'

echo "==> Seeding the built-in user and catalog"
tools sh -c 'DATABASE_URL="$OWNER_DATABASE_URL" pnpm --silent --filter @reconcile/db exec prisma db seed'

echo "==> Starting the app"
compose up -d --remove-orphans api worker web caddy

echo "==> Demo data (first deploy only)"
tools node --import tsx apps/api/src/load-demo.ts

docker image prune --force --filter "until=24h" >/dev/null || true
echo "==> Deployed $COMMIT"
