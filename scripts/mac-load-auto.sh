#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="

echo "===== MAC LOAD AUTO ====="
echo "-- TIME --"
date
echo

echo "-- UPTIME / LOAD --"
uptime
echo

echo "-- MEMORY PRESSURE (SHORT) --"
memory_pressure | sed -n '1,20p'
echo

echo "-- TOP CPU 15 --"
ps -Ao pid,ppid,%cpu,%mem,etime,command | sort -k3 -nr | head -15
echo

echo "-- KNOWLEDGECONSTRUCTIOND --"
ps -Ao pid,%cpu,%mem,command | grep knowledgeconstructiond | grep -v grep || echo "NOT_RUNNING"
echo

echo "-- CHROME RENDERERS --"
ps -Ao pid,%cpu,%mem,command | grep 'Google Chrome Helper (Renderer)' | grep -v grep || echo "NO_HEAVY_RENDERER"
echo

echo "-- JARVIS NODE --"
ps -Ao pid,%cpu,%mem,command | grep 'node --import ./dist/instrument.js dist/index.js' | grep -v grep || echo "JARVIS_NODE_NOT_FOUND"
echo

echo "-- JARVIS HEALTH --"
curl -sS http://localhost:3000/health
echo
echo

echo "-- JARVIS LATENCY 3x --"
for i in 1 2 3; do
  curl -o /dev/null -s -w "run_$i time_total=%{time_total}\n" http://localhost:3000/health
done
