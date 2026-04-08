#!/bin/bash
set -euo pipefail

PROFILE="${1:-soft}"

echo "===== MAC CLEAN ====="
echo "PROFILE: $PROFILE"

run_soft() {
  echo
  echo "## SOFT CLEAN"
  killall knowledgeconstructiond 2>/dev/null || true
  sleep 3
}

run_web() {
  echo
  echo "## WEB CLEAN"
  osascript -e 'tell application "Safari" to quit' 2>/dev/null || true
  osascript -e 'tell application "Mail" to quit' 2>/dev/null || true
  osascript -e 'tell application "ChatGPT" to quit' 2>/dev/null || true
  killall "com.apple.WebKit.WebContent" 2>/dev/null || true
  pkill -f "WebKit.WebContent" 2>/dev/null || true
  sleep 5
}

run_spike() {
  echo
  echo "## SPIKE CLEAN"
  killall knowledgeconstructiond 2>/dev/null || true
  osascript -e 'tell application "Safari" to quit' 2>/dev/null || true
  osascript -e 'tell application "Mail" to quit' 2>/dev/null || true
  osascript -e 'tell application "ChatGPT" to quit' 2>/dev/null || true
  killall "com.apple.WebKit.WebContent" 2>/dev/null || true
  pkill -f "WebKit.WebContent" 2>/dev/null || true
  sleep 5
}

case "$PROFILE" in
  soft)
    run_soft
    ;;
  web)
    run_web
    ;;
  spike)
    run_spike
    ;;
  *)
    echo "UNKNOWN PROFILE: $PROFILE"
    echo "Use: soft | web | spike"
    exit 1
    ;;
esac

echo
echo "## CPU TOP AFTER CLEAN"
ps -Ao pid,ppid,%cpu,%mem,etime,command | sort -k3 -nr | sed -n '1,12p'

echo
echo "## MEMORY TOP AFTER CLEAN"
ps -Ao pid,ppid,%mem,%cpu,etime,command | sort -k3 -nr | sed -n '1,12p'
