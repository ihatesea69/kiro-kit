---
description: Generate a new React component with TypeScript, tests, and stories
inclusion: manual
argument-hint: "[component-name] [component-type]"
---

## Arguments
NAME: $1 (required, PascalCase component name)
TYPE: $2 (default: functional, options: functional, server, client)

## Workflow
1. Determine component location based on project structure
2. Create component file with TypeScript interface for props
3. Add `use client` directive if TYPE is client
4. Create colocated test file with React Testing Library
5. Create barrel export if directory-based structure
6. Run typecheck to verify no errors

## Output Structure
```
components/[name]/
  index.tsx          Component implementation
  [name].test.tsx    Unit tests
  [name].types.ts    TypeScript interfaces (if complex)
```

## Conventions
- Functional components with explicit return types
- Props interface exported separately
- Default export for the component
- Named exports for sub-components and utilities
