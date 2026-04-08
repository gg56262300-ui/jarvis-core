#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

echo "===== CHATGPT READONLY REPORT ====="
curl -s http://localhost:3000/api/debug/chatgpt-readonly-context | python3 -c '
import sys, json
j = json.load(sys.stdin)
print("ok=", j.get("ok"))
print("context=", j.get("context"))
print("cwd=", j.get("cwd"))

cs = j.get("currentState") or {}
print("current_state_id=", cs.get("id"))
print("current_state_status=", cs.get("status"))

cl = j.get("currentLast") or {}
print("current_cmd=", cl.get("cmd"))
print("current_exit_code=", cl.get("exit_code"))

pending = j.get("pending")
print("pending_exists=", pending is not None)

allowed = j.get("allowed") or []
print("allowed_count=", len(allowed))
for item in allowed[:10]:
    print("allowed=", item.get("id"), item.get("area"), item.get("requiresConfirmation"))
'
