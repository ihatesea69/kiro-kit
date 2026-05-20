# Discord Hook Setup

## Prerequisites

- A Discord server where you have admin or webhook management permissions
- A text channel for receiving notifications

## Steps

1. Open your Discord server settings
2. Navigate to Integrations > Webhooks
3. Click "New Webhook"
4. Select the target channel
5. Copy the webhook URL
6. Set the `DISCORD_WEBHOOK_URL` environment variable

## Configuration

Add to your `.env` or hooks `.env`:

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
```

## Testing

Run the hook manually:

```bash
DISCORD_WEBHOOK_URL="your-url" node .kiro/hooks/discord-notify.js "Test message"
```

## Customization

The hook sends plain text messages. To customize the message format, edit `discord-notify.js` and modify the payload to use Discord embed format.
