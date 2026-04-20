#!/bin/bash
set -euo pipefail

BASE_URL="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"
LIMIT="${1:-50}"

echo "===== MAKE HEALTH CHECK ====="

test_raw="$(curl -s -S --max-time 12 -X POST "$BASE_URL/api/integrations/make/test" 2>/dev/null || true)"
if [ -z "$test_raw" ]; then
  echo "MAKE_TEST: no response"
  exit 1
fi

make_delivered="$(printf "%s" "$test_raw" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j?.makeDelivered===true?"1":"0")}catch{process.stdout.write("0")}})')"
upstream_status="$(printf "%s" "$test_raw" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(j?.upstreamStatus??""))}catch{process.stdout.write("")}})')"
failure_kind="$(printf "%s" "$test_raw" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(j?.failureKind??""))}catch{process.stdout.write("")}})')"
recommendation="$(printf "%s" "$test_raw" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(j?.recommendation??""))}catch{process.stdout.write("")}})')"

if [ "$make_delivered" = "1" ]; then
  echo "MAKE_DELIVERY: OK"
else
  echo "MAKE_DELIVERY: FAIL"
  [ -n "$upstream_status" ] && echo "UPSTREAM_STATUS: $upstream_status"
  [ -n "$failure_kind" ] && echo "FAILURE_KIND: $failure_kind"
  [ -n "$recommendation" ] && echo "RECOMMENDATION: $recommendation"
fi

failed_raw="$(curl -s -S --max-time 12 "$BASE_URL/api/integrations/make/failed?limit=$LIMIT" 2>/dev/null || true)"
if [ -z "$failed_raw" ]; then
  echo "FAILED_SUMMARY: missing"
  [ "$make_delivered" = "1" ] && exit 0 || exit 1
fi

top_kind="$(printf "%s" "$failed_raw" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const s=j?.summary&&typeof j.summary==="object"?j.summary:{};const pairs=Object.entries(s);if(!pairs.length){process.stdout.write("");return;}pairs.sort((a,b)=>Number(b[1])-Number(a[1]));const [k,v]=pairs[0];process.stdout.write(String(k)+":"+String(v));}catch{process.stdout.write("")}})')"
retryable_count="$(printf "%s" "$failed_raw" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(Number(j?.retryableCount)||0));}catch{process.stdout.write("0")}})')"
total_count="$(printf "%s" "$failed_raw" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(Number(j?.count)||0));}catch{process.stdout.write("0")}})')"

nonretryable_raw="$(curl -s -S --max-time 12 "$BASE_URL/api/integrations/make/failed?limit=$LIMIT&retryable=false" 2>/dev/null || true)"
nonretryable_count="$(printf "%s" "$nonretryable_raw" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(Number(j?.count)||0));}catch{process.stdout.write("0")}})')"

echo "FAILED_LAST_${LIMIT}: $total_count"
echo "RETRYABLE_LAST_${LIMIT}: $retryable_count"
echo "NONRETRYABLE_LAST_${LIMIT}: $nonretryable_count"
[ -n "$top_kind" ] && echo "TOP_FAILURE_KIND: $top_kind"

if [ "$make_delivered" = "1" ]; then
  exit 0
fi

if [ "$nonretryable_count" -gt 0 ]; then
  exit 2
fi

exit 1
