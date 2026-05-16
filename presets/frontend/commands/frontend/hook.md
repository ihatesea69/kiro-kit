---
description: Generate a custom React hook with TypeScript and tests
inclusion: manual
argument-hint: "[hook-name]"
---

## Arguments
NAME: $1 (required, must start with "use")

## Workflow
1. Validate hook name starts with "use"
2. Create hook file with proper TypeScript generics
3. Create colocated test file
4. Add JSDoc documentation for parameters and return value
5. Run typecheck to verify

## Output Structure
```
hooks/
  [name].ts          Hook implementation
  [name].test.ts     Unit tests
```

## Conventions
- Hook name must start with "use" (e.g., useDebounce, useLocalStorage)
- Return tuple or object with clear naming
- Include cleanup in useEffect if applicable
- Handle SSR safety (check typeof window)
- Generic types for flexible reuse
