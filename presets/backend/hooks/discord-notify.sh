#!/usr/bin/env bash
# Sends a notification to Discord via webhook. Requires DISCORD_WEBHOOK_URL.

MESSAGE="${*:-Agent task completed.}"

if [ -z "$DISCORD_WEBHOOK_URL" ]; then
  echo "[discord-notify] DISCORD_WEBHOOK_URL not set. Skipping." >&2
  exit 0
fi

# Build JSON safely so quotes/newlines/backslashes in the message cannot break
# the payload or inject additional webhook fields. Prefer jq; otherwise use node
# (guaranteed present — kiro-kit requires Node) for correct JSON encoding.
if command -v jq >/dev/null 2>&1; then
  payload=$(jq -n --arg content "$MESSAGE" '{content:$content}')
else
  payload=$(MSG="$MESSAGE" node -e 'process.stdout.write(JSON.stringify({content:process.env.MSG||""}))')
fi

curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "$DISCORD_WEBHOOK_URL" | grep -q "^2" && exit 0 || exit 1
