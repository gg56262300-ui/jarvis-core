#!/bin/bash
set -euo pipefail

cd ~/jarvis-core || exit 1

echo
echo "===== LATENCY SNAPSHOT ====="

python3 - <<'PY'
import json
import re
from collections import defaultdict
from pathlib import Path

log_path = Path("logs/jarvis-backend.log")
if not log_path.exists():
    print("LOG FILE NOT FOUND")
    raise SystemExit(0)

rows = []
for line in log_path.read_text(errors="ignore").splitlines():
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        obj = json.loads(line)
    except Exception:
        continue
    if "durationMs" in obj and "url" in obj and "method" in obj:
        rows.append({
            "method": obj.get("method"),
            "url": obj.get("url"),
            "durationMs": obj.get("durationMs", 0),
            "statusCode": obj.get("statusCode"),
        })

if not rows:
    print("NO HTTP DURATION DATA FOUND")
    raise SystemExit(0)

grouped = defaultdict(list)
for r in rows:
    grouped[f'{r["method"]} {r["url"]}'].append(r["durationMs"])

for key, vals in sorted(grouped.items(), key=lambda kv: (-max(kv[1]), kv[0])):
    avg = sum(vals) / len(vals)
    print(f"{key} | count={len(vals)} | avgMs={avg:.1f} | maxMs={max(vals)}")
PY
