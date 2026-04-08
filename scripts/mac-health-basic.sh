#!/bin/bash
set -euo pipefail

echo "===== MAC HEALTH BASIC ====="

echo
echo "## CPU TOP"
top_cpu="$(ps -Ao pid,ppid,%cpu,%mem,etime,command | sort -k3 -nr | sed -n '1,8p')"
echo "$top_cpu"

echo
echo "## MEMORY TOP"
top_mem="$(ps -Ao pid,ppid,%mem,%cpu,etime,command | sort -k3 -nr | sed -n '1,8p')"
echo "$top_mem"

echo
echo "## DISK"
df -h /

echo
echo "## QUICK FLAGS"
high_cpu="0"
if echo "$top_cpu" | awk 'NR==1 { if ($3+0 >= 80) exit 0; else exit 1 }'; then
  high_cpu="1"
fi

chrome_hot="0"
if echo "$top_cpu" | grep -Eqi 'Google Chrome|Chrome Helper'; then
  chrome_hot="1"
fi

chatgpt_hot="0"
if echo "$top_cpu" | grep -qi '/Applications/ChatGPT.app/'; then
  chatgpt_hot="1"
fi

window_hot="0"
if echo "$top_cpu" | grep -qi 'WindowServer'; then
  window_hot="1"
fi

xprotect_hot="0"
if echo "$top_cpu" | grep -qi 'XprotectService'; then
  xprotect_hot="1"
fi

if [ "$high_cpu" = "1" ]; then
  echo "🟡 HIGH CPU: top process is very high"
else
  echo "🟢 HIGH CPU: no extreme spike"
fi

if [ "$chrome_hot" = "1" ]; then
  echo "🟡 CHROME: visible in CPU top"
else
  echo "🟢 CHROME: no major CPU signal"
fi

if [ "$chatgpt_hot" = "1" ]; then
  echo "🟡 CHATGPT APP: visible in CPU top"
else
  echo "🟢 CHATGPT APP: no major CPU signal"
fi

if [ "$window_hot" = "1" ]; then
  echo "🟡 WINDOWSERVER: UI load visible"
else
  echo "🟢 WINDOWSERVER: no major UI spike"
fi

if [ "$xprotect_hot" = "1" ]; then
  echo "🟡 XPROTECT: security scan/load active"
else
  echo "🟢 XPROTECT: no major scan load"
fi

echo
echo "## OVERALL"
if [ "$high_cpu" = "1" ]; then
  echo "🟡 MAC: needs attention"
else
  echo "🟢 MAC: usable"
fi

echo
echo "## NEXT ACTION"
if [ "$chrome_hot" = "1" ]; then
  echo "🟡 Reduce Chrome tabs/windows and re-check"
elif [ "$chatgpt_hot" = "1" ]; then
  echo "🟡 Restart ChatGPT app and re-check"
elif [ "$window_hot" = "1" ]; then
  echo "🟡 Reduce window/UI load and re-check"
elif [ "$xprotect_hot" = "1" ]; then
  echo "🟡 Wait for Xprotect load to finish and re-check"
else
  echo "🟢 Continue normal work"
fi
