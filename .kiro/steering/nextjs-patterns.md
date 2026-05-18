---
inclusion: always
description: Next.js App Router patterns including routing, data fetching, caching, and deployment conventions.
---

# Next.js Patterns

## App Router Structure

```
app/
  layout.tsx           Root layout (html, body, providers)
  page.tsx             Home page
  loading.tsx          Root loading state
  error.tsx            Root error boundary
  not-found.tsx        404 page
  (auth)/              Route group for auth pages
    login/page.tsx
    register/page.tsx
  dashboard/
    layout.tsx         Dashboard layout (sidebar, nav)
    page.tsx           Dashboard home
    settings/page.tsx  Nested route
  api/                 Route handlers
    [resource]/route.ts
```

## Data Fetching

- Server Components: fetch directly with caching options
- Use `cache: 'force-cache'` for static data (default)
- Use `cache: 'no-store'` for dynamic data
- Use `next: { revalidate: 60 }` for ISR
- Parallel fetching: use `Promise.all` for independent requests
- Sequential fetching: only when data depends on previous result

## Route Handlers (API Routes)

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const data = await fetchData();
  return NextResponse.json(data);
}
```

## Metadata and SEO

- Use `generateMetadata` for dynamic metadata
- Export static `metadata` object for fixed pages
- Include Open Graph and Twitter card metadata
- Use `robots.ts` and `sitemap.ts` for SEO

## Performance Patterns

- Use `next/image` for all images (automatic optimization)
- Use `next/font` for font loading (no layout shift)
- Dynamic imports for heavy components: `dynamic(() => import(...))`
- Use `loading.tsx` for instant loading states
- Implement streaming with nested Suspense boundaries

## Environment Variables

- `NEXT_PUBLIC_*` for client-side variables
- Server-only variables: no prefix (never exposed to client)
- Use `.env.local` for local development
- Validate env vars at build time with `@t3-oss/env-nextjs`

## Error Handling

- `error.tsx` at each route segment for granular error boundaries
- `error.tsx` must be a Client Component (`'use client'`)
- Include reset button to retry the failed operation
- Log errors to monitoring service in production
- Use `notFound()` function for 404 responses
