# Hooks

Cross-platform hook scripts for Kiro IDE automation.

## Available Hooks

| Hook | Trigger | Description |
|------|---------|-------------|
| scout-block | PreToolUse | Blocks dangerous commands (rm -rf, drop database, etc.) |
| modularization-hook | PostToolUse | Warns when files exceed 200 lines |
| discord-notify | agentStop | Sends notification via Discord webhook |
| telegram-notify | agentStop | Sends notification via Telegram bot |
| pre-commit-lint | PreToolUse | Runs linter before commit |
| git-status-tracker | PostToolUse | Logs git working tree status summary |

## Platform Support

Each hook has a primary `.js` (Node.js) version and platform-specific fallbacks:
- `.js` - Cross-platform (requires Node.js)
- `.sh` - Unix/macOS/Linux (bash)
- `.ps1` - Windows (PowerShell)

## Environment Variables

Copy `hooks/.env.example` to `hooks/.env` and configure:
- `DISCORD_WEBHOOK_URL` - Required for discord-notify
- `TELEGRAM_BOT_TOKEN` - Required for telegram-notify
- `TELEGRAM_CHAT_ID` - Required for telegram-notify
