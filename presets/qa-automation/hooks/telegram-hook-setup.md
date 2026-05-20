# Telegram Hook Setup

## Prerequisites

- A Telegram account
- BotFather access for creating bots

## Steps

1. Open Telegram and search for @BotFather
2. Send /newbot and follow prompts to create a bot
3. Copy the bot token provided
4. Start a conversation with your bot
5. Get your chat ID (send a message, then check https://api.telegram.org/botYOUR_TOKEN/getUpdates)
6. Set environment variables

## Configuration

Add to your `.env` or hooks `.env`:

```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=987654321
```

## Testing

Run the hook manually:

```bash
TELEGRAM_BOT_TOKEN="your-token" TELEGRAM_CHAT_ID="your-chat-id" node .kiro/hooks/telegram-notify.js "Test message"
```

## Group Notifications

To send notifications to a group:
1. Add your bot to the group
2. Use the group chat ID (usually negative number)
3. Ensure the bot has message permissions
