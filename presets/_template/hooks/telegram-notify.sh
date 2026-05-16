#!/usr/bin/env bash
# Sends a notification to Telegram via bot API.
# Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in environment.

MESSAGE="${*:-Agent task completed.}"

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo "[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping." >&2
  exit 0
fi

curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"$MESSAGE\"}" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  | grep -q "^2" && exit 0 || exit 1
