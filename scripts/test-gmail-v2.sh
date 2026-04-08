#!/bin/sh

set -eu

URL="${JARVIS_BASE_URL:-http://localhost:3000}/api/voice/turns"

run_test() {
  text="$1"

  printf '\n========================================\n'
  printf 'Gmail V2 test: %s\n' "$text"
  printf 'POST %s\n' "$URL"
  printf '========================================\n'

  curl --silent --show-error \
    --request POST \
    --url "$URL" \
    --header 'Content-Type: application/json; charset=utf-8' \
    --data "{\"text\":\"$text\",\"locale\":\"et-EE\",\"source\":\"text\"}"

  printf '\n'
}

run_test 'näita 10 viimast kirja'
run_test 'otsi kiri saatjalt Hetzner'
run_test 'näita kirjad saatjalt Amazon'
run_test 'otsi kiri teemaga Invoice'
run_test 'näita kirjad teemaga Travel'
run_test 'loe viimane kiri saatjalt Amazon'
run_test 'loe viimane kiri teemaga Travel'
run_test 'loe kiri number 4'
run_test 'loe viimane kiri'
