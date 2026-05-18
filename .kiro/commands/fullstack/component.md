---
description: Generate a React component with TypeScript types and test file
inclusion: manual
argument-hint: "[component-name] [type]"
---

## Arguments
NAME: $1 (required, PascalCase)
TYPE: $2 (default: "server", options: server, client)

## Workflow
1. Create component file at appropriate location
2. Add TypeScript props interface
3. Add `'use client'` directive if type is client
4. Create colocated test file
5. Export from barrel file if one exists
6. Report created files
