#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-fastify-api}"
NO_PULL="false"
NO_INSTALL="false"

usage() {
  cat <<EOF
Usage: ./deploy.sh [--no-pull] [--no-install]

Options:
  --no-pull     Skip git pull step
  --no-install  Skip npm install step

Environment variables:
  APP_NAME      PM2 app name (default: fastify-api)
EOF
}

for arg in "$@"; do
  case "$arg" in
    --no-pull)
      NO_PULL="true"
      ;;
    --no-install)
      NO_INSTALL="true"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      usage
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[deploy] Working directory: $SCRIPT_DIR"

for cmd in git npm pm2; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[deploy] Missing required command: $cmd"
    exit 1
  fi
done

if [[ ! -f "ecosystem.config.js" ]]; then
  echo "[deploy] Missing ecosystem.config.js"
  exit 1
fi

if [[ "$NO_PULL" == "false" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "[deploy] Working tree is not clean. Commit/stash changes before deploy."
    exit 1
  fi

  echo "[deploy] Pulling latest code..."
  git pull --ff-only
else
  echo "[deploy] Skipping git pull"
fi

if [[ "$NO_INSTALL" == "false" ]]; then
  echo "[deploy] Installing production dependencies..."
  if [[ -f "package-lock.json" ]]; then
    npm ci --omit=dev
  else
    npm install --production
  fi
else
  echo "[deploy] Skipping npm install"
fi

echo "[deploy] Starting/restarting PM2 app: $APP_NAME"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.js --env production
fi

echo "[deploy] Saving PM2 process list..."
pm2 save

echo "[deploy] Current PM2 status:"
pm2 status "$APP_NAME"

echo "[deploy] Deployment completed successfully."