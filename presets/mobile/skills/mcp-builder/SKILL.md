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

- Creating new MCP server integrations
- Exposing mobile development tools via MCP
- Building custom tool servers for Flutter/Dart tooling
- Integrating device management or emulator control

## Process

1. Define the tools the server should expose
2. Choose implementation language (TypeScript or Python)
3. Implement tool handlers with proper input validation
4. Add error handling and timeout management
5. Document tool schemas and usage
6. Test with MCP inspector

## Rules

- Tools must have clear, descriptive names
- Input schemas must validate all parameters
- Errors must be informative and actionable
- Keep tool count focused (5-15 per server)
- Document environment variables required
