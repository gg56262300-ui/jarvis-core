#!/bin/sh

set -eu

URL="${JARVIS_BASE_URL:-http://localhost:3000}/api/voice/turns"

run_test() {
  text="$1"

  printf '\n========================================\n'
  printf 'Voice test: %s\n' "$text"
  printf 'POST %s\n' "$URL"
  printf '========================================\n'

  curl --silent --show-error \
    --request POST \
    --url "$URL" \
    --header 'Content-Type: application/json; charset=utf-8' \
    --data "{\"text\":\"$text\",\"locale\":\"et-EE\",\"source\":\"text\"}"

  printf '\n'
}

run_test 'loe üheksas kiri'
run_test 'loe kümnes kiri'
run_test 'loe kiri number 4'
run_test 'loe 4 kiri'
run_test 'loe viimane kiri'
