# Configuration

## Settings Hierarchy

Settings are merged with precedence:
1. User-level: `~/.kiro/settings/mcp.json` (global)
2. Workspace-level: `.kiro/settings/mcp.json` (per project)

Workspace settings override user settings.

## MCP Configuration

File: `.kiro/settings/mcp.json`

```json
{
  "mcpServers": {
    "server-name": {
      "command": "uvx",
      "args": ["package-name@latest"],
      "env": {
        "API_KEY": "your-key"
      },
      "disabled": false,
      "autoApprove": ["tool-name"]
    }
  }
}
```

## Key Settings

- `command`: Executable to run the MCP server
- `args`: Command-line arguments
- `env`: Environment variables passed to the server
- `disabled`: Enable/disable without removing config
- `autoApprove`: Tools that don't require user confirmation

## Multi-Root Workspaces

Each workspace folder can have its own `.kiro/settings/mcp.json`. Configs merge with later folders taking precedence.
