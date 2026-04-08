#!/bin/sh

set -eu

URL="${JARVIS_BASE_URL:-http://localhost:3000}/api/voice/turns"

run_test() {
  text="$1"

  printf '\n========================================\n'
  printf 'Gmail V3 test: %s\n' "$text"
  printf 'POST %s\n' "$URL"
  printf '========================================\n'

  curl --silent --show-error \
    --request POST \
    --url "$URL" \
    --header 'Content-Type: application/json; charset=utf-8' \
    --data "{\"text\":\"$text\",\"locale\":\"et-EE\",\"source\":\"text\"}"

  printf '\n'
}

run_test 'näita 5 viimast kirja'
run_test 'otsi kiri saatjalt Amazon'
run_test 'otsi kiri teemaga Travel'
run_test 'näita lugemata kirjad'
run_test 'loe esimene leitud kiri'
run_test 'loe teine leitud kiri'
run_test 'loe viimane leitud kiri'
run_test 'loe viimane lugemata kiri'
run_test 'mitu kirja saatjalt Amazon'
run_test 'mitu kirja teemaga Travel'
run_test 'mitu lugemata kirja'
