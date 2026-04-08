#!/bin/bash
set -euo pipefail

echo "===== RRR CLEAN MAC ====="

echo
echo "## BEFORE CPU TOP"
ps -Ao pid,ppid,%cpu,%mem,etime,command | sort -k3 -nr | sed -n '1,12p'

echo
echo "## QUIT APPS"
osascript -e 'tell application "ChatGPT" to quit' 2>/dev/null || true
osascript -e 'tell application "Google Chrome" to quit' 2>/dev/null || true
osascript -e 'tell application "Safari" to quit' 2>/dev/null || true
osascript -e 'tell application "Mail" to quit' 2>/dev/null || true
osascript -e 'tell application "WhatsApp" to quit' 2>/dev/null || true
osascript -e 'tell application "Messenger" to quit' 2>/dev/null || true
osascript -e 'tell application "Codex" to quit' 2>/dev/null || true

echo
echo "## KILL LEFTOVER WEB/CHAT PROCESSES"
pkill -x "ChatGPT" 2>/dev/null || true
pkill -x "Google Chrome" 2>/dev/null || true
pkill -x "Safari" 2>/dev/null || true
pkill -x "Mail" 2>/dev/null || true
pkill -x "WhatsApp" 2>/dev/null || true
pkill -x "Messenger" 2>/dev/null || true
pkill -x "Codex" 2>/dev/null || true
pkill -f "WebKit.WebContent" 2>/dev/null || true
pkill -f "Google Chrome Helper" 2>/dev/null || true
pkill -f "Codex Helper" 2>/dev/null || true

echo
echo "## WAIT"
sleep 5

echo
echo "## AFTER CPU TOP"
ps -Ao pid,ppid,%cpu,%mem,etime,command | sort -k3 -nr | sed -n '1,12p'

echo
echo "## PM2"
pm2 list

echo
echo "## HEALTH"
curl -s --max-time 5 http://localhost:3000/health | python3 -m json.tool || true
