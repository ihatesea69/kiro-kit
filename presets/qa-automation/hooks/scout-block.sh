#!/usr/bin/env bash
# Security guard: blocks dangerous commands before execution.
# Registered as PreToolUse hook.

INPUT="$*"

BLOCKED_PATTERNS=(
  "rm -rf /"
  "rm -fr /"
  "rm -rf ~"
  "rm -rf ."
  "drop database"
  "drop table"
  "truncate table"
  "mkfs."
  "dd if="
  "chmod -R 777 /"
  "shutdown"
  "reboot"
  "init 0"
  "format c:"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$INPUT" | grep -qi "$pattern"; then
    echo "[scout-block] Blocked dangerous command: $INPUT" >&2
    exit 2
  fi
done

exit 0
