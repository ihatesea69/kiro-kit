# Hooks

This directory contains lifecycle hooks for the QA automation preset. Hooks are scripts that run at specific points during agent operations.

## Hook Types

- **PreToolUse**: Run before a tool is executed (e.g., security guards)
- **PostToolUse**: Run after a tool completes (e.g., quality checks)
- **agentStop**: Run when agent completes a task (e.g., notifications)

## Available Hooks

| Hook | Type | Description |
|------|------|-------------|
| scout-block.js | PreToolUse | Blocks dangerous commands |
| test-runner-guard.js | PreToolUse | Ensures tests are run before completion |
| modularization-hook.js | PostToolUse | Warns on oversized files |
| test-coverage-check.js | PostToolUse | Validates coverage thresholds |
| flaky-test-detector.js | PostToolUse | Detects flaky test patterns |
| git-status-tracker.js | PostToolUse | Tracks git working tree changes |
| discord-notify.js | agentStop | Sends Discord webhook notification |
| telegram-notify.js | agentStop | Sends Telegram bot notification |

## Configuration

Hooks are configured in `settings.json`. Each hook entry specifies:
- `matcher`: regex pattern for when to trigger
- `command`: the script to execute

## Cross-Platform Support

Notification and security hooks include .sh (Unix) and .ps1 (Windows) fallbacks alongside the primary .js implementation.

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `DISCORD_WEBHOOK_URL`: Discord webhook for notifications
- `TELEGRAM_BOT_TOKEN`: Telegram bot API token
- `TELEGRAM_CHAT_ID`: Telegram chat for notifications
- `MIN_COVERAGE`: Minimum coverage threshold (default: 80)
