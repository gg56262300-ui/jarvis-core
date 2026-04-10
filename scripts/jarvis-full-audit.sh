#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="

echo "===== JARVIS FULL AUDIT ====="
echo "-- TIME --"
date
echo

echo "-- PWD --"
pwd
echo

echo "-- PM2 STATUS --"
pm2 status jarvis
echo

echo "-- PORT 3000 --"
lsof -i :3000 | sed -n '1,10p'
echo

echo "-- HEALTH --"
curl -sS http://localhost:3000/health
echo
echo

echo "-- LATENCY 5x --"
for i in 1 2 3 4 5; do
  curl -o /dev/null -s -w "run_$i time_total=%{time_total}\n" http://localhost:3000/health
done
echo

echo "-- PACKAGE SCRIPTS KEY --"
node - <<'JS'
const p = require('./package.json');
const s = p.scripts || {};
for (const k of Object.keys(s).sort()) {
  if (
    k.includes('check:') ||
    k.includes('gate') ||
    k.includes('backup') ||
    k.includes('health') ||
    k.includes('calendar')
  ) {
    console.log(k + " = " + s[k]);
  }
}
JS
echo

echo "-- CALENDAR LOCAL CHECK --"
npm run check:calendar-local
echo

echo "-- JARVIS HEALTH CHECK --"
npm run check:jarvis-health
echo

echo "-- MAC LOAD CHECK --"
npm run check:mac-load
echo

echo "-- LAST 40 ERROR LOG LINES --"
tail -n 40 ~/.pm2/logs/jarvis-error.log 2>/dev/null || true
echo

echo "-- LAST 40 OUT LOG LINES --"
tail -n 40 ~/.pm2/logs/jarvis-out.log 2>/dev/null || true
echo

echo "-- OTEL 4318 COUNT (last 200 error lines) --"
tail -n 200 ~/.pm2/logs/jarvis-error.log 2>/dev/null | grep -c '4318' || true
echo

echo "-- DONE --"
