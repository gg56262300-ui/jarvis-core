#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

echo "===== PREFLIGHT CHECK ====="

fail() {
  echo
  echo "=================================================="
  echo "===== SAADA MULLE ALATES SIIT ====="
  echo "=================================================="
  echo "PREFLIGHT_STOP: $1"
  exit 1
}

[ -f package.json ] || fail "package.json puudub"
[ -f tsconfig.json ] || fail "tsconfig.json puudub"
[ -d src ] || fail "src kaust puudub"

SEARCH_PATHS="src scripts"

if grep -Rni "heredoc>" $SEARCH_PATHS \
  --exclude=preflight-check.sh \
  --exclude=safe-build-restart-test.sh \
  --exclude=safe-patch-build-restart-test.sh \
  >/dev/null 2>&1; then
  fail "leiti ripakil heredoc marker"
fi

if grep -Rni "cmdand cmdand" $SEARCH_PATHS \
  --exclude=preflight-check.sh \
  --exclude=safe-build-restart-test.sh \
  --exclude=safe-patch-build-restart-test.sh \
  >/dev/null 2>&1; then
  fail "leiti katkise käsu jääk"
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "git worktree puudub"
fi

echo "PREFLIGHT_OK"
