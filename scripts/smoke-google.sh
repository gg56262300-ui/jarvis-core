#!/bin/bash
set -euo pipefail

BASE_URL="http://localhost:3000"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "===== BUILD ====="
npm run build

echo
echo "===== GMAIL ROOT ====="
curl --max-time 5 -s "$BASE_URL/api/gmail" | tee "$TMP_DIR/gmail-root.json" | python3 -m json.tool || true

echo
echo "===== GMAIL AUTH URL ====="
curl --max-time 5 -s "$BASE_URL/api/gmail/google/auth-url" | tee "$TMP_DIR/gmail-auth.json" | python3 -m json.tool || true

echo
echo "===== GMAIL START (302) ====="
curl --max-time 5 -s -o /dev/null -D "$TMP_DIR/gmail-start.headers" "$BASE_URL/api/gmail/google/start" || true
head -n 5 "$TMP_DIR/gmail-start.headers" || true

echo
echo "===== GMAIL INBOX ====="
curl --max-time 10 -s "$BASE_URL/api/gmail/inbox?limit=3" | tee "$TMP_DIR/gmail-inbox.json" | python3 -m json.tool || true

echo
echo "===== CALENDAR ROOT ====="
curl --max-time 5 -s "$BASE_URL/api/calendar" | tee "$TMP_DIR/calendar-root.json" | python3 -m json.tool || true

echo
echo "===== CALENDAR AUTH URL ====="
curl --max-time 5 -s "$BASE_URL/api/calendar/google/auth-url" | tee "$TMP_DIR/calendar-auth.json" | python3 -m json.tool || true

echo
echo "===== CALENDAR START (302) ====="
curl --max-time 5 -s -o /dev/null -D "$TMP_DIR/calendar-start.headers" "$BASE_URL/api/calendar/google/start" || true
head -n 5 "$TMP_DIR/calendar-start.headers" || true

echo
echo "===== CALENDAR UPCOMING ====="
curl --max-time 10 -s "$BASE_URL/api/calendar/upcoming" | tee "$TMP_DIR/calendar-upcoming.json" | python3 -m json.tool || true

echo
echo "===== CONTACTS AUTH URL ====="
curl --max-time 5 -s "$BASE_URL/api/contacts/google/auth-url" | tee "$TMP_DIR/contacts-auth.json" | python3 -m json.tool || true

echo
echo "===== CONTACTS START (302) ====="
curl --max-time 5 -s -o /dev/null -D "$TMP_DIR/contacts-start.headers" "$BASE_URL/api/contacts/google/start" || true
head -n 5 "$TMP_DIR/contacts-start.headers" || true

echo
echo "===== CONTACTS LIST ====="
curl --max-time 10 -s "$BASE_URL/api/contacts/list" | tee "$TMP_DIR/contacts-list.json" | python3 -m json.tool || true

echo
echo "===== GOOGLE SMOKE SUMMARY ====="
python3 - <<'PY' "$TMP_DIR"
import json
import sys
from pathlib import Path

tmp = Path(sys.argv[1])

def load(name):
    p = tmp / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None

def is_ok(obj, *keys):
    if not isinstance(obj, dict):
        return False
    cur = obj
    for key in keys:
        if not isinstance(cur, dict) or key not in cur:
            return False
        cur = cur[key]
    return True

gmail_root = load("gmail-root.json")
gmail_auth = load("gmail-auth.json")
gmail_inbox = load("gmail-inbox.json")

calendar_root = load("calendar-root.json")
calendar_auth = load("calendar-auth.json")
calendar_upcoming = load("calendar-upcoming.json")

contacts_auth = load("contacts-auth.json")
contacts_list = load("contacts-list.json")

gmail_pass = (
    isinstance(gmail_root, dict) and gmail_root.get("status") == "ready" and
    isinstance(gmail_auth, dict) and "authUrl" in gmail_auth and
    isinstance(gmail_inbox, dict) and gmail_inbox.get("status") == "ready"
)

calendar_pass = (
    isinstance(calendar_root, dict) and calendar_root.get("status") == "ready" and
    isinstance(calendar_auth, dict) and "authUrl" in calendar_auth and
    isinstance(calendar_upcoming, dict) and calendar_upcoming.get("status") == "ready"
)

contacts_pass = (
    isinstance(contacts_auth, dict) and "authUrl" in contacts_auth and
    isinstance(contacts_list, dict) and contacts_list.get("status") == "ready"
)

overall = gmail_pass and calendar_pass and contacts_pass

print(f"GMAIL = {'PASS' if gmail_pass else 'FAIL'}")
print(f"CALENDAR = {'PASS' if calendar_pass else 'FAIL'}")
print(f"CONTACTS = {'PASS' if contacts_pass else 'FAIL'}")
print(f"OVERALL = {'PASS' if overall else 'FAIL'}")
PY
