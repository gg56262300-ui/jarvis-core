#!/bin/sh
set -eu

ID="${1:-}"

if [ -z "$ID" ]; then
  echo "SAFE_RUN_ID_REQUIRED"
  exit 2
fi

case "$ID" in
  pwd)
    CMD='pwd'
    ;;
  pwd_confirm)
    CMD='pwd'
    ;;
  health)
    CMD='curl -s http://localhost:3000/health'
    ;;
  pm2_status_jarvis)
    CMD='pm2 status jarvis'
    ;;
  status_summary)
    CMD='curl -s -X POST http://localhost:3000/api/voice/turns -H "Content-Type: application/json" -d '\''{"text":"kontrolli jarvise seisu","locale":"et-EE","inputMode":"text","outputMode":"text"}'\'''
    ;;
  debug_logs_text)
    CMD='curl -s http://localhost:3000/api/debug/logs/text'
    ;;
  terminal_last_json)
    CMD='curl -s http://localhost:3000/api/debug/terminal-last/json'
    ;;
  jarvis_snapshot)
    CMD='printf "===== HEALTH =====\n"; curl -s http://localhost:3000/health; printf "\n\n===== STATUS =====\n"; curl -s -X POST http://localhost:3000/api/voice/turns -H "Content-Type: application/json" -d '\''{"text":"kontrolli jarvise seisu","locale":"et-EE","inputMode":"text","outputMode":"text"}'\''; printf "\n\n===== PM2 =====\n"; pm2 status jarvis'
    ;;
  jarvis_logs_quick)
    CMD='printf "===== DEBUG LOGS TEXT =====\n"; curl -s http://localhost:3000/api/debug/logs/text'
    ;;
  crm_leads_quick)
    CMD='printf "===== CRM LEADS =====\n"; curl -s http://localhost:3000/api/crm/leads'
    ;;
  control_summary)
    CMD='curl -s http://localhost:3000/api/debug/control-summary'
    ;;
  control_summary_compact)
    CMD='curl -s http://localhost:3000/api/debug/control-summary-compact'
    ;;
  terminal_restore_check)
    CMD='curl -s http://localhost:3000/api/debug/terminal-restore-check'
    ;;
  terminal_restore_check_compact)
    CMD='curl -s http://localhost:3000/api/debug/terminal-restore-check-compact'
    ;;
  terminal_restore_prev_confirm)
    CMD='curl -s -X POST http://localhost:3000/api/debug/terminal-restore-prev'
    ;;
  execution_state_compact)
    CMD='curl -s http://localhost:3000/api/debug/execution-state-compact'
    ;;
  *)
    echo "SAFE_RUN_NOT_ALLOWED: $ID"
    exit 3
    ;;
esac

./scripts/terminal-capture.sh "$CMD"
