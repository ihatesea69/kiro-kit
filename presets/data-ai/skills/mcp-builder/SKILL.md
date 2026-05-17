---
name: mcp-builder
description: >-
  Build MCP (Model Context Protocol) servers for data and ML tool integration.
  Use when creating custom tool servers for database access, model inference, or
  data processing.
license: Complete terms in LICENSE.txt
---

# MCP Builder

Activate this skill when building MCP servers for data/ML integrations.

## When to Use

- Creating database query tools for agents
- Building model inference endpoints as MCP tools
- Wrapping data processing functions as tools
- Integrating external APIs (cloud ML services)
- Building custom data retrieval tools

## Structure

```python
from mcp.server import Server
from mcp.types import Tool

server = Server("data-tools")

@server.tool()
async def query_dataset(query: str, dataset: str) -> str:
    """Execute a query against a dataset."""
    # Implementation
    return results
```

## Rules

- Keep tools focused on single responsibilities
- Use typed parameters with clear descriptions
- Handle errors gracefully with informative messages
- Document expected inputs and outputs
- Test tools independently before integration

