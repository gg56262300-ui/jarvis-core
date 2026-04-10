#!/usr/bin/env bash
set -euo pipefail

TEST_TITLE="JARVIS SELF CHECK $(date +%H%M%S)"

echo "=================================================="
echo "===== SAADA MULLE ALATES SIIT ====="
echo "=================================================="

echo "===== HEALTH ====="
curl -fsS http://localhost:3000/health
echo

echo "===== BUILD ====="
npm run build
echo

echo "===== PROOF: JOURNAL + UNDO ====="
grep -n "writeLastCalendarAction" src/calendar/calendar.service.ts
grep -n "clearLastCalendarAction\|readLastCalendarAction" src/calendar/calendarActionJournal.ts src/calendar/calendarUndo.service.ts
grep -n "calendar-undo-last" src/debug/index.ts scripts/jarvis-calendar-undo-last.sh
echo

echo "===== PROOF: PARSER RANGE GUARD ====="
grep -n "tomorrowSingleTimeMatch" src/voice/calendar-command.parser.ts
grep -n "kuni\\\\b" src/voice/calendar-command.parser.ts
echo

echo "===== CREATE TEST EVENT ====="
./scripts/jarvis-calendar.sh "lisa kalendrisse homme kell 10 kuni 11 $TEST_TITLE"
echo

echo "===== JOURNAL AFTER CREATE ====="
cat data/calendar-last-action.json
echo

echo "===== UNDO LAST ====="
./scripts/jarvis-calendar-undo-last.sh
echo

echo "===== JOURNAL AFTER UNDO ====="
if [ -f data/calendar-last-action.json ]; then
  echo "JOURNAL_STILL_EXISTS"
else
  echo "JOURNAL_CLEARED"
fi
echo

echo "===== UPCOMING MATCH ====="
curl -sS http://localhost:3000/api/calendar/upcoming | grep -o "$TEST_TITLE" || true
