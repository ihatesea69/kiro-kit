# Hooks

Cross-platform hook scripts for Kiro IDE automation.

## Available Hooks

| Hook | Trigger | Registered | Description |
|------|---------|-----------|-------------|
| scout-block | `PreToolUse` | `scout-block.json` | Blocks dangerous commands (rm -rf, drop database, etc.) |
| modularization-hook | `PostToolUse` | `modularization-hook.json` | Warns when files exceed 200 lines |
| discord-notify | `Stop` | `discord-notify.json` | Sends notification via Discord webhook |
| telegram-notify | `Stop` | `telegram-notify.json` | Sends notification via Telegram bot |
| pre-commit-lint | `PreToolUse` | not registered | Runs linter before commit — wire it up yourself |
| git-status-tracker | `PostToolUse` | not registered | Logs git working tree status summary |

Each registered script has a matching v1 hook file in this directory that Kiro reads
at session start. Kiro 1.0 no longer reads a `hooks` key from `settings.json`, so
that is where registration lives now — see `native-hooks.md`.

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
