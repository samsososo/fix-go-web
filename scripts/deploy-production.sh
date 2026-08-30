#!/usr/bin/env bash

set -euo pipefail

SERVER="${DEPLOY_SERVER:-root@76.13.212.102}"
PROJECT_DIR="fix-go-web"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOCAL_ENV_FILE="${DEPLOY_PRODUCTION_ENV_FILE:-$PROJECT_ROOT/.env.production}"
REMOTE_ENV_FILE=".env.production"
REMOTE_ENV_TMP=".env.production.uploading"

if [[ ! -s "$LOCAL_ENV_FILE" ]]; then
  echo "Missing or empty production environment file: $LOCAL_ENV_FILE" >&2
  exit 1
fi

echo "Syncing .env.production and deploying the production environment..."

ssh "$SERVER" "
  set -e
  cd '$PROJECT_DIR'
  umask 077
  cleanup_env_upload() {
    rm -f '$REMOTE_ENV_TMP'
  }
  trap cleanup_env_upload EXIT
  cat > '$REMOTE_ENV_TMP'
  chmod 600 '$REMOTE_ENV_TMP'
  mv -f '$REMOTE_ENV_TMP' '$REMOTE_ENV_FILE'
  trap - EXIT
  git pull --ff-only
  docker compose -f docker-compose.hostinger.yml up -d --build --no-deps web-prod
  if docker compose -f docker-compose.hostinger.yml ps --status running --services | grep -qx caddy; then
    docker compose -f docker-compose.hostinger.yml exec -T caddy \
      caddy validate --config /etc/caddy/Caddyfile
    docker compose -f docker-compose.hostinger.yml exec -T caddy \
      caddy reload --config /etc/caddy/Caddyfile
  else
    docker compose -f docker-compose.hostinger.yml up -d --no-deps caddy
  fi
" < "$LOCAL_ENV_FILE"
