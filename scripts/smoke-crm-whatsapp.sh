#!/bin/bash
set -euo pipefail

BASE_URL="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"
unset npm_config_devdir 2>/dev/null || true
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "===== CRM LEADS ====="
curl --max-time 10 -s "${BASE_URL%/}/api/crm/leads" | tee "$TMP_DIR/crm-leads.json" | python3 -m json.tool >/dev/null || true

echo
echo "===== CRM CREATE LEAD (smoke) ====="
payload='{"source":"manual","phone":"+37255500000","name":"Smoke Test","tag":"smoke","notes":"smoke","projectCode":"remont","city":"Tallinn","serviceType":"test"}'
curl --max-time 10 -s -H 'Content-Type: application/json' -d "$payload" "${BASE_URL%/}/api/crm/leads" | tee "$TMP_DIR/crm-create.json" | python3 -m json.tool >/dev/null || true

echo
echo "===== WHATSAPP INBOUND (smoke) ====="
wp='{"phone":"+37255500000","name":"Smoke Test","message":"Test message","projectCode":"remont","city":"Tallinn","serviceType":"test"}'
curl --max-time 10 -s -H 'Content-Type: application/json' -d "$wp" "${BASE_URL%/}/api/whatsapp/inbound" | tee "$TMP_DIR/whatsapp-inbound.json" | python3 -m json.tool >/dev/null || true

echo
echo "===== SUMMARY ====="
python3 - <<'PY' "$TMP_DIR"
import json, sys
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

crm_leads = load("crm-leads.json")
crm_create = load("crm-create.json")
wa_in = load("whatsapp-inbound.json")

crm_ok = isinstance(crm_leads, dict) and crm_leads.get("status") == "ready"
create_ok = isinstance(crm_create, dict) and crm_create.get("status") == "ready"
wa_ok = isinstance(wa_in, dict) and wa_in.get("status") == "ready"

print(f"CRM_LIST = {'PASS' if crm_ok else 'FAIL'}")
print(f"CRM_CREATE = {'PASS' if create_ok else 'FAIL'}")
print(f"WHATSAPP_INBOUND = {'PASS' if wa_ok else 'FAIL'}")
print(f"OVERALL = {'PASS' if (crm_ok and create_ok and wa_ok) else 'FAIL'}")
PY

