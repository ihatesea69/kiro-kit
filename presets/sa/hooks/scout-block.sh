#!/usr/bin/env bash
# Best-effort guard: blocks obviously-dangerous commands before execution.
# NOTE: a denylist is defense-in-depth, NOT a security boundary — it can be
# bypassed. The .js variant (used as the primary PreToolUse hook) is authoritative.

INPUT="$*"

# ERE patterns with [[:space:]] so alternate spacing does not trivially bypass.
PATTERNS=(
  'rm[[:space:]]+-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+[/~]'
  'rm[[:space:]]+-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+\$?(HOME)'
  'find[[:space:]].*-delete'
  'drop[[:space:]]+(database|table|schema)'
  'truncate[[:space:]]+table'
  'mkfs\.'
  'dd[[:space:]]+if=.*of=/dev'
  'chmod[[:space:]]+-R[[:space:]]+777[[:space:]]+/'
  '>[[:space:]]*/dev/sd[a-z]'
  'shutdown'
  'reboot'
  'init[[:space:]]+0'
  'format[[:space:]]+[a-z]:'
)

shopt -s nocasematch
for pattern in "${PATTERNS[@]}"; do
  if [[ "$INPUT" =~ $pattern ]]; then
    echo "[scout-block] Blocked dangerous command: $INPUT" >&2
    exit 2
  fi
done
exit 0
