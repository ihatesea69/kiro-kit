#!/usr/bin/env bash
# Sends a notification to Discord via webhook.
# Requires DISCORD_WEBHOOK_URL in environment.

MESSAGE="${*:-Agent task completed.}"

if [ -z "$DISCORD_WEBHOOK_URL" ]; then
  echo "[discord-notify] DISCORD_WEBHOOK_URL not set. Skipping." >&2
  exit 0
fi

curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"$MESSAGE\"}" \
  "$DISCORD_WEBHOOK_URL" | grep -q "^2" && exit 0 || exit 1
