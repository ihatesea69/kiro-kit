---
name: mcp-management
description: Manage MCP servers -- discover, analyze, and execute tools from configured servers. Use when working with MCP integrations or discovering available capabilities.
---

# MCP Management

Activate this skill when managing MCP server configurations or discovering capabilities.

## When to Use

- Discovering available MCP tools across servers
- Configuring new MCP server connections
- Troubleshooting MCP connectivity issues
- Filtering tools for specific tasks
- Managing multi-server environments

## Configuration

MCP servers are configured in `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@package/mcp-server"],
      "env": { "API_KEY": "${ENV_VAR}" }
    }
  }
}
```

## Rules

- Verify server availability before execution
- Never expose credentials in tool output
- Use environment variables for sensitive values
- Test tool parameters against schema before calling
- Handle timeouts and connection failures gracefully
