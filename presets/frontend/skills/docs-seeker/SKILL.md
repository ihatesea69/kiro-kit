---
name: docs-seeker
description: Search and retrieve technical documentation for libraries, frameworks, and APIs. Use when you need current documentation for a specific package or technology.
---

# Docs Seeker

Activate this skill when you need to find or reference documentation for libraries and frameworks.

## When to Use

- Looking up API documentation for a library
- Finding usage examples for a package
- Checking configuration options for a tool
- Verifying function signatures and parameters
- Finding migration guides between versions

## Process

1. Identify the library/framework and version
2. Search official documentation sources
3. Check for llms.txt or context7 sources
4. Extract relevant API signatures and examples
5. Summarize findings with links to sources

## Sources Priority

1. Official documentation site
2. GitHub repository README and docs
3. TypeScript type definitions
4. Community examples and guides

## Rules

- Always note the version being referenced
- Prefer TypeScript type definitions for API accuracy
- Flag deprecated APIs or breaking changes
- Include import statements in examples
