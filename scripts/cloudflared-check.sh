#!/bin/sh
# cloudflared olemasolu (+ valikuliselt PM2 cloudflared).
set -eu
unset npm_config_devdir 2>/dev/null || true

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "FAIL: cloudflared puudub PATH-is"
  exit 1
fi

ver="$(cloudflared --version 2>/dev/null | head -n 1 || echo '?')"
echo "OK: $ver"

if [ "${JARVIS_CLOUDFLARED_STRICT:-0}" = "1" ] && command -v pm2 >/dev/null 2>&1; then
  if ! pm2 jlist 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); import sys as s; s.exit(0 if any(x.get('name')=='cloudflared' and (x.get('pm2_env') or {}).get('status')=='online' for x in d) else 1)" 2>/dev/null; then
    echo "FAIL: pm2 cloudflared pole online"
    exit 1
  fi
  echo "OK: pm2 cloudflared online"
fi

echo "KOKKU: OK"
