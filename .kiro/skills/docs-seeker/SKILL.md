---
name: docs-seeker
description: >-
  Search and retrieve technical documentation from official sources. Use when
  you need current documentation for libraries, frameworks, or APIs.
version: 3.1.0
---

# Docs Seeker

Activate this skill when you need to find or verify technical documentation.

## When to Use

- Looking up API documentation for a library
- Finding configuration options for a framework
- Verifying correct usage of a function or method
- Checking version-specific behavior or breaking changes
- Finding migration guides between versions

## Process

1. Identify the library/framework and version
2. Search official documentation sources first
3. Check for llms.txt or context7.com sources
4. Verify information against the specific version in use
5. Extract relevant code examples and configuration

## Sources Priority

1. Official documentation (docs site, README)
2. llms.txt / context7.com aggregated docs
3. GitHub repository (source code, issues, discussions)
4. Release notes and changelogs
5. Community resources (verified accuracy)

## Rules

- Always verify documentation matches the version in use
- Prefer code examples from official sources
- Note when documentation is incomplete or outdated
- Cross-reference multiple sources for critical information
- Include links to source documentation
