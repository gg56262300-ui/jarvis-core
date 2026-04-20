#!/bin/bash
set -euo pipefail

# Gmail + Contacts smoke. (Calendar is already in smoke:google.)
BASE_URL="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"
unset npm_config_devdir 2>/dev/null || true
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "===== BUILD ====="
npm run build

echo
echo "===== GMAIL ROOT ====="
curl --max-time 5 -s "${BASE_URL%/}/api/gmail" | tee "$TMP_DIR/gmail-root.json" | python3 -m json.tool >/dev/null || true

echo
echo "===== GMAIL AUTH URL ====="
curl --max-time 5 -s "${BASE_URL%/}/api/gmail/google/auth-url" | tee "$TMP_DIR/gmail-auth.json" | python3 -m json.tool >/dev/null || true

echo
echo "===== GMAIL INBOX ====="
curl --max-time 10 -s "${BASE_URL%/}/api/gmail/inbox?limit=3" | tee "$TMP_DIR/gmail-inbox.json" | python3 -m json.tool >/dev/null || true

echo
echo "===== CONTACTS AUTH URL ====="
curl --max-time 5 -s "${BASE_URL%/}/api/contacts/google/auth-url" | tee "$TMP_DIR/contacts-auth.json" | python3 -m json.tool >/dev/null || true

echo
echo "===== CONTACTS LIST ====="
curl --max-time 10 -s "${BASE_URL%/}/api/contacts/list" | tee "$TMP_DIR/contacts-list.json" | python3 -m json.tool >/dev/null || true

echo
echo "===== COMMS SMOKE SUMMARY ====="
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

gmail_root = load("gmail-root.json")
gmail_auth = load("gmail-auth.json")
gmail_inbox = load("gmail-inbox.json")
contacts_auth = load("contacts-auth.json")
contacts_list = load("contacts-list.json")

gmail_pass = (
    isinstance(gmail_root, dict) and gmail_root.get("status") == "ready" and
    isinstance(gmail_auth, dict) and "authUrl" in gmail_auth and
    isinstance(gmail_inbox, dict) and gmail_inbox.get("status") == "ready"
)

contacts_pass = (
    isinstance(contacts_auth, dict) and "authUrl" in contacts_auth and
    isinstance(contacts_list, dict) and contacts_list.get("status") == "ready"
)

overall = gmail_pass and contacts_pass
print(f"GMAIL = {'PASS' if gmail_pass else 'FAIL'}")
print(f"CONTACTS = {'PASS' if contacts_pass else 'FAIL'}")
print(f"OVERALL = {'PASS' if overall else 'FAIL'}")
PY

