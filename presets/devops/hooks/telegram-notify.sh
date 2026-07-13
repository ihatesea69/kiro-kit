#!/usr/bin/env bash
# Sends a Telegram notification. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.

MESSAGE="${*:-Agent task completed.}"

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo "[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping." >&2
  exit 0
fi

# Build JSON safely (no injection via message or chat id). Prefer jq; otherwise
# use node (guaranteed present) for correct JSON encoding.
if command -v jq >/dev/null 2>&1; then
  payload=$(jq -n --arg chat_id "$TELEGRAM_CHAT_ID" --arg text "$MESSAGE" '{chat_id:$chat_id, text:$text}')
else
  payload=$(CID="$TELEGRAM_CHAT_ID" MSG="$MESSAGE" node -e 'process.stdout.write(JSON.stringify({chat_id:process.env.CID||"",text:process.env.MSG||""}))')
fi

# Pass the token-bearing URL via a curl config file on stdin so the token does
# NOT appear in the process table (ps / /proc/<pid>/cmdline) as an argument.
curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  --config - <<CURLCFG | grep -q "^2" && exit 0 || exit 1
url = "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"
CURLCFG
