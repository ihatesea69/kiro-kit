---
description: Generate a Next.js page with layout, loading, and error handling
inclusion: manual
argument-hint: "[route-path]"
---

## Arguments
ROUTE: $1 (required, e.g., "dashboard", "settings/profile")

## Workflow
1. Create page directory at `app/$1/`
2. Generate `page.tsx` as Server Component by default
3. Generate `loading.tsx` with skeleton UI
4. Generate `error.tsx` with error boundary
5. Add metadata export for SEO
6. Run typecheck to verify

## Output Structure
```
app/[route]/
  page.tsx           Page component (Server Component)
  loading.tsx        Loading skeleton
  error.tsx          Error boundary (Client Component)
```

## Conventions
- Pages are Server Components by default
- Use generateMetadata for dynamic SEO
- Implement proper loading states with Suspense
- Error boundaries must be Client Components
- Use route groups for shared layouts
