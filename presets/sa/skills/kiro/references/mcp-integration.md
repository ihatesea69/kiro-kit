# MCP Integration

## Overview

Model Context Protocol (MCP) connects external tools and services to Kiro. Servers provide tools that the AI agent can invoke.

## Configuration

File: `.kiro/settings/mcp.json`

```json
{
  "mcpServers": {
    "server-name": {
      "command": "uvx",
      "args": ["package@latest"],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Common Servers

- `awslabs.aws-documentation-mcp-server` - AWS documentation
- `@anthropic/mcp-server-filesystem` - File system access
- `@anthropic/mcp-server-github` - GitHub integration

## Installation

Most MCP servers use `uvx` (from the `uv` Python package manager):
1. Install `uv`: https://docs.astral.sh/uv/getting-started/installation/
2. Add server config to mcp.json
3. Server auto-starts on config change

## Auto-Approve

List tool names in `autoApprove` to skip confirmation prompts:
```json
{
  "autoApprove": ["read_file", "search_files"]
}
```

## Troubleshooting

- Check server logs in Kiro's MCP Server view
- Verify `uvx` is installed and accessible
- Ensure environment variables are set correctly
- Use command palette: "MCP" to find relevant commands
- Servers reconnect automatically on config changes
