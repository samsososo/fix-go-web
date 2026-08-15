#!/usr/bin/env bash

set -euo pipefail

SERVER="root@76.13.212.102"
PROJECT_DIR="fix-go-web"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOCAL_ENV_FILE="${DEPLOY_DEV_ENV_FILE:-$PROJECT_ROOT/.env.dev}"
REMOTE_ENV_FILE=".env.dev"
REMOTE_ENV_TMP=".env.dev.uploading"

if [[ ! -s "$LOCAL_ENV_FILE" ]]; then
  echo "Missing or empty dev environment file: $LOCAL_ENV_FILE" >&2
  exit 1
fi

echo "Syncing .env.dev and deploying the dev environment..."

# Stream the ignored local env file over SSH without printing its contents.
# The old remote file remains intact until the upload is complete, then mv
# replaces it atomically with owner-only permissions.
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
  git pull
  docker compose -f docker-compose.hostinger.dev.yml up -d --build
" < "$LOCAL_ENV_FILE"
