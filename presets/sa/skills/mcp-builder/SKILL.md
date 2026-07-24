---
name: mcp-builder
description: >-
  Guide for creating MCP (Model Context Protocol) servers that enable LLMs to
  interact with external services. Use when building MCP integrations.
license: Complete terms in LICENSE.txt
---

# MCP Builder

Activate this skill when building MCP servers to integrate external APIs or services.

## When to Use

- Creating a new MCP server for an external API
- Integrating infrastructure tools via MCP
- Building custom tool interfaces for LLM agents
- Wrapping CLI tools as MCP resources

## Process

1. Define the tools, resources, and prompts the server will expose
2. Choose implementation language (Python with FastMCP or Node with MCP SDK)
3. Implement tool handlers with proper input validation
4. Add error handling and timeout management
5. Test with MCP inspector
6. Document tool schemas and usage examples

## Rules

- Keep tool descriptions clear and specific
- Validate all inputs before processing
- Handle errors gracefully with informative messages
- Use proper typing for tool parameters
- Document required environment variables
- Test edge cases and error scenarios
