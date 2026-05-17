---
name: mcp-builder
description: >-
  Build MCP (Model Context Protocol) servers that enable LLMs to interact with
  external services through well-designed tools. Use when creating MCP
  integrations.
license: Complete terms in LICENSE.txt
---

# MCP Builder

Activate when building MCP servers to integrate external APIs or services with LLM agents.

## When to Use

- Creating new MCP server integrations
- Exposing external APIs as MCP tools
- Building custom tool interfaces for agents
- Implementing MCP resources and prompts

## Server Structure (TypeScript)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });

server.tool('tool-name', { param: z.string() }, async ({ param }) => {
  // Implementation
  return { content: [{ type: 'text', text: result }] };
});
```

## Best Practices

- Keep tools focused and single-purpose
- Validate all inputs with Zod schemas
- Return structured, parseable responses
- Handle errors gracefully with descriptive messages
- Document each tool with clear descriptions
- Use environment variables for credentials
