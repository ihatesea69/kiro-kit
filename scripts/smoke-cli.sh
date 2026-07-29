#!/usr/bin/env bash
# Cross-platform smoke test for the packed kiro-kit tarball.
# Runs the REAL CLI binary as a subprocess — the vitest suite only exercises
# core modules in-process, so it cannot catch hangs or TTY-dependent bugs.
#
# Usage (inside a Linux/macOS shell with node + npm on PATH):
#   scripts/smoke-cli.sh /path/to/kiro-kit-<version>.tgz
set -euo pipefail

TARBALL="${1:?usage: smoke-linux.sh <tarball.tgz>}"
PREFIX="$(mktemp -d)"
WS="$(mktemp -d)"
TIMEOUT="${SMOKE_TIMEOUT:-180}"

cleanup() { rm -rf "$PREFIX" "$WS"; }
trap cleanup EXIT

# macOS ships no GNU `timeout` (it lives in coreutils, which is not installed
# by default), so fall back to gtimeout, then to perl's alarm.
if command -v timeout >/dev/null 2>&1; then
  with_timeout() { timeout "$@"; }
elif command -v gtimeout >/dev/null 2>&1; then
  with_timeout() { gtimeout "$@"; }
else
  with_timeout() { local s="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }
fi

echo "== installing $TARBALL =="
npm i -g --prefix "$PREFIX" "$TARBALL" >/dev/null

BIN="$PREFIX/bin/kiro-kit"
[ -x "$BIN" ] || { echo "FAIL: $BIN not executable"; exit 1; }

run_init() {
  # </dev/null is deliberate: if init ever waits for stdin it dies immediately
  # instead of hanging, which is exactly the failure mode we are guarding.
  cd "$WS"
  with_timeout "$TIMEOUT" "$BIN" "$@" </dev/null
}

echo "== 1. multi-preset init (the case that used to hang) =="
if ! run_init init --preset backend --preset frontend --yes --powers none; then
  echo "FAIL: init hung or exited non-zero"
  exit 1
fi

COUNT=$(find "$WS" -type f | wc -l | tr -d ' ')
echo "files written: $COUNT"
[ "$COUNT" -gt 100 ] || { echo "FAIL: expected >100 files, got $COUNT"; exit 1; }

echo "== 2. rerun must be idempotent =="
OUT=$(run_init init --preset backend --preset frontend --yes --powers none)
echo "$OUT" | grep -q "0 written" || { echo "FAIL: rerun was not idempotent"; echo "$OUT" | tail -20; exit 1; }

echo "== 3. executable bits survive on POSIX =="
BAD=$(find "$WS" -name '*.sh' ! -perm -u+x -print | head -5)
[ -z "$BAD" ] || { echo "FAIL: .sh files missing +x:"; echo "$BAD"; exit 1; }

echo "== 4. shebang lines end with LF, not CRLF =="
# A CRLF shebang makes POSIX exec fail with "bad interpreter: /bin/bash^M".
# atomicWrite normalizes on write, so this guards against that regressing.
CRLF=""
while IFS= read -r f; do
  if head -c 200 "$f" | od -An -c | grep -q '\\r'; then CRLF="$CRLF$f"$'\n'; fi
done < <(find "$WS" -name '*.sh')
[ -z "$CRLF" ] || { echo "FAIL: CRLF line endings in:"; echo "$CRLF"; exit 1; }

echo "== 5. doctor passes on the fresh workspace =="
run_init doctor >/dev/null || { echo "FAIL: doctor reported problems"; exit 1; }

echo
echo "ALL SMOKE CHECKS PASSED"
