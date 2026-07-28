---
name: mcp-management
description: Manage MCP server configurations and tool discovery. Use when configuring data tool servers, discovering available capabilities, or troubleshooting MCP connections.
---

# MCP Management

Activate this skill when managing MCP server integrations for data workflows.

## When to Use

- Configuring MCP servers in `.kiro/mcp.json`
- Discovering available tools from connected servers
- Troubleshooting MCP connection issues
- Selecting appropriate tools for data tasks
- Managing server lifecycle and resources

## Configuration

```json
{
  "mcpServers": {
    "data-tools": {
      "command": "python",
      "args": ["-m", "data_tools.server"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

## Rules

- Verify server health before relying on tools
- Use environment variables for credentials
- Document available tools and their parameters
- Handle server disconnections gracefully
- Monitor tool execution times for performance

