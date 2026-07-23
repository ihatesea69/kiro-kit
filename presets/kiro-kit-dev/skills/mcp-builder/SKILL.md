---
name: mcp-builder
description: >-
  Guide for creating MCP (Model Context Protocol) servers that enable LLMs to
  interact with external services. Use when building MCP server integrations.
license: Complete terms in LICENSE.txt
---

# MCP Builder

Activate this skill when building MCP servers to integrate external APIs or services.

## When to Use

- Creating a new MCP server for an API
- Adding tools, prompts, or resources to an MCP server
- Debugging MCP server connectivity
- Designing tool schemas for LLM consumption

## MCP Server Structure

- Tools: functions the LLM can call
- Resources: data the LLM can read
- Prompts: pre-built prompt templates

## Implementation (TypeScript)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });

server.tool('tool-name', { param: z.string() }, async ({ param }) => {
  return { content: [{ type: 'text', text: result }] };
});
```

## Implementation (Python)

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-server")

@mcp.tool()
def tool_name(param: str) -> str:
    return result
```

## Rules

- Design tools with clear, specific names
- Use Zod/Pydantic schemas for input validation
- Handle errors gracefully with informative messages
- Keep tool descriptions concise but complete
- Test tools independently before integration
