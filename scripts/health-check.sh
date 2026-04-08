#!/bin/bash
set -u

cd ~/jarvis-core || exit 1

echo
echo "===== BUILD CHECK ====="
npm run build

echo
echo "===== HEALTH ====="
curl --max-time 5 -s http://localhost:3000/health || echo "HEALTH FAILED"

echo
echo "===== JOBS STATUS ====="
curl --max-time 5 -s http://localhost:3000/api/jobs/status | python3 -m json.tool || echo "JOBS STATUS FAILED"

echo
echo "===== REDIS PING ====="
redis-cli ping || echo "REDIS FAILED"


echo
echo "===== SYSTEM LOAD ====="
uptime || true


echo
echo "===== CPU ====="
top -l 1 | head -n 10 || true

echo
echo "===== DISK ====="
df -h / || true

echo
echo "===== MEMORY ====="
vm_stat | head -n 12 || true

echo
echo "===== NODE PROCESSES ====="
ps aux | grep node | grep -v grep || true

echo
echo "===== PORT 3000 ====="
lsof -nP -iTCP:3000 -sTCP:LISTEN || true

echo
echo "===== LOG TAIL ====="
tail -n 40 logs/jarvis-backend.log || true
