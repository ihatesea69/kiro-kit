# Sends a notification to Discord via webhook.
# Requires DISCORD_WEBHOOK_URL in environment.

$Message = if ($args.Count -gt 0) { $args -join ' ' } else { 'Agent task completed.' }

$WebhookUrl = $env:DISCORD_WEBHOOK_URL

if (-not $WebhookUrl) {
    Write-Error "[discord-notify] DISCORD_WEBHOOK_URL not set. Skipping."
    exit 0
}

$Body = @{ content = $Message } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $Body -ContentType 'application/json'
    exit 0
} catch {
    exit 1
}
