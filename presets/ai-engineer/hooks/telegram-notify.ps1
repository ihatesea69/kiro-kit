# Sends a Telegram notification. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.

$Message = if ($args.Count -gt 0) { $args -join ' ' } else { 'Agent task completed.' }
$Token = $env:TELEGRAM_BOT_TOKEN
$ChatId = $env:TELEGRAM_CHAT_ID

if (-not $Token -or -not $ChatId) {
    Write-Error "[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping."
    exit 0
}

# ConvertTo-Json safely encodes the message; the token stays in a variable and
# is never placed on a command line (avoids exposure in process/logging).
$Body = @{ chat_id = $ChatId; text = $Message } | ConvertTo-Json -Compress
$Uri = "https://api.telegram.org/bot$Token/sendMessage"
try {
    Invoke-RestMethod -Uri $Uri -Method Post -Body $Body -ContentType 'application/json' | Out-Null
    exit 0
} catch {
    exit 1
}
