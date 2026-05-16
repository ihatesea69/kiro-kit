---
name: mcp-management
description: Manage MCP servers -- discover, analyze, and execute tools from configured servers. Use when working with MCP integrations or discovering available capabilities.
---

# MCP Management

Activate this skill when managing or using MCP server integrations.

## When to Use

- Discovering available MCP capabilities
- Configuring MCP servers for the project
- Troubleshooting MCP connection issues
- Filtering MCP tools for specific tasks
- Managing multi-server configurations

## Process

1. List configured servers from mcp.json
2. Verify server availability and health
3. Discover available tools per server
4. Execute tools with proper parameters
5. Handle errors and timeouts gracefully

## Rules

- Always verify server is running before tool calls
- Document required environment variables
- Keep mcp.json organized and commented
- Never commit actual API keys in mcp.json
- Test tool availability before relying on it
