---
description: Generate a Next.js layout component for a route segment
inclusion: manual
argument-hint: "[route-path]"
---

## Arguments
ROUTE: $1 (required, e.g., "dashboard", "(auth)")

## Workflow
1. Create or update layout at `app/$1/layout.tsx`
2. Include proper TypeScript children prop typing
3. Add metadata if applicable
4. Set up shared UI elements (nav, sidebar, footer)
5. Run typecheck to verify

## Output Structure
```
app/[route]/
  layout.tsx         Layout component
```

## Conventions
- Layouts are Server Components by default
- Accept `children` prop with `React.ReactNode` type
- Use route groups `(groupName)` for shared layouts without URL impact
- Layouts persist across navigations (no re-render)
- Include proper metadata for the route segment
- Keep layouts minimal -- delegate complex UI to components
