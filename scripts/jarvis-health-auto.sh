#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="

echo "===== JARVIS AUTO HEALTH ====="
echo "-- TIME --"
date
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

echo "-- TOP CPU 12 --"
ps -Ao pid,ppid,%cpu,%mem,etime,command | sort -k3 -nr | head -12
echo

echo "-- OTEL ERROR COUNT (last 200 lines) --"
pm2 logs jarvis --lines 200 --nostream 2>&1 | grep -c 'ECONNREFUSED.*4318' || true
echo

echo "-- LAST 30 ERROR LINES --"
pm2 logs jarvis --lines 30 --nostream 2>&1 | sed -n '/jarvis-error\.log last 30 lines:/,$p'
