---
name: mcp-management
description: Manage MCP servers -- discover, analyze, and execute tools from configured servers. Use when working with MCP integrations or discovering available capabilities.
---

# MCP Management

Activate this skill when managing or using MCP server integrations.

## When to Use

- Discovering available MCP tools and capabilities
- Executing MCP tools programmatically
- Troubleshooting MCP server connectivity
- Configuring new MCP servers
- Filtering tools for specific tasks

## Process

1. List configured MCP servers from `.kiro/settings/mcp.json`
2. Check server availability and health
3. Discover available tools, prompts, and resources
4. Match capabilities to the current task
5. Execute with proper parameters
6. Handle errors and suggest alternatives

## Rules

- Always verify server availability before execution
- Never expose credentials in tool output
- Validate parameters against tool schema
- Handle timeouts gracefully
- Report failures with actionable guidance
