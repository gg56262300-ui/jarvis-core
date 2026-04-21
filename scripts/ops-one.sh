#!/bin/sh
set -eu

unset npm_config_devdir 2>/dev/null || true

MAX_WAIT="${JARVIS_OPS_ONE_MAX_WAIT:-30}"
ALLOW_DIRTY="${JARVIS_OPS_ONE_ALLOW_DIRTY:-0}"
SKIP_NPM_CI="${JARVIS_OPS_ONE_SKIP_NPM_CI:-0}"
SKIP_PM2="${JARVIS_OPS_ONE_SKIP_PM2:-0}"
SKIP_OPENAI="${JARVIS_OPS_ONE_SKIP_OPENAI:-0}"
SKIP_PUBLIC="${JARVIS_OPS_ONE_SKIP_PUBLIC:-0}"
RUN_SMOKE="${JARVIS_OPS_ONE_RUN_SMOKE:-0}"

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [ "$ALLOW_DIRTY" != "1" ]; then
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null || [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
    echo "FAIL: git working tree is dirty (set JARVIS_OPS_ONE_ALLOW_DIRTY=1 to override)"
    exit 1
  fi
fi

echo "===== OPS:ONE ====="

echo "== git pull =="
git pull --ff-only

if command -v npm >/dev/null 2>&1; then
  echo "== secrets scan =="
  npm run -s gate:secrets
fi

if [ "$SKIP_NPM_CI" != "1" ]; then
  echo "== npm ci =="
  npm ci
fi

echo "== build =="
npm run build

if command -v npm >/dev/null 2>&1; then
  echo "== cloudflared check =="
  npm run -s check:cloudflared || true
fi

if [ "$SKIP_OPENAI" != "1" ]; then
  echo "== openai auth =="
  npm run check:openai-auth
fi

echo "== channel check (pre-restart) =="
if [ "$SKIP_PUBLIC" = "1" ]; then
  JARVIS_CHANNEL_CHECK_COMPACT=1 JARVIS_PUBLIC_BASE="http://127.0.0.1:3000" npm run channel:check
else
  JARVIS_CHANNEL_CHECK_COMPACT=1 npm run channel:check
fi

if [ "$SKIP_PM2" != "1" ]; then
  if command -v pm2 >/dev/null 2>&1; then
    echo "== pm2 restart jarvis =="
    pm2 restart jarvis --update-env >/dev/null

    if pm2 jlist 2>/dev/null | python3 -c "import json,sys; data=json.load(sys.stdin); import sys as _s; _s.exit(0 if any(x.get('name')=='cloudflared' for x in data) else 1)" >/dev/null 2>&1; then
      echo "== pm2 restart cloudflared =="
      pm2 restart cloudflared >/dev/null || true
    fi
  else
    echo "WARN: pm2 not found; skipping restarts"
  fi
fi

if [ -x "./scripts/jarvis-wait-ready.sh" ]; then
  echo "== wait ready (${MAX_WAIT}s) =="
  ./scripts/jarvis-wait-ready.sh "$MAX_WAIT" >/dev/null || true
fi

echo "== channel check (post-restart) =="
if [ "$SKIP_PUBLIC" = "1" ]; then
  JARVIS_CHANNEL_CHECK_COMPACT=1 JARVIS_PUBLIC_BASE="http://127.0.0.1:3000" npm run channel:check
else
  JARVIS_CHANNEL_CHECK_COMPACT=1 npm run channel:check
fi

if command -v npm >/dev/null 2>&1; then
  echo "== health:compact =="
  npm run -s health:compact || true
fi

if [ "$RUN_SMOKE" = "1" ] && command -v npm >/dev/null 2>&1; then
  echo "== smoke (full) =="
  npm run -s smoke || true
fi

echo "OK: ops:one done"

