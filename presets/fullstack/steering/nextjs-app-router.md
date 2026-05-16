---
inclusion: always
description: Next.js App Router patterns for routing, data fetching, caching, Server Actions, and API route handlers.
---

# Next.js App Router

## Route Structure

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
  (dashboard)/         Route group for authenticated pages
    layout.tsx         Dashboard layout (sidebar, nav)
    page.tsx           Dashboard home
    settings/page.tsx
  api/                 Route handlers (REST endpoints)
    [resource]/route.ts
    trpc/[trpc]/route.ts  tRPC handler (if using tRPC)
```

## Data Fetching

- Server Components: fetch directly or call server functions
- Use `cache: 'force-cache'` for static data (default)
- Use `cache: 'no-store'` for dynamic data
- Use `next: { revalidate: 60 }` for ISR
- Parallel fetching: `Promise.all` for independent requests
- Use Server Actions for mutations (form submissions)

## Server Actions

- Define with `'use server'` directive
- Use for form submissions and data mutations
- Integrate with `useActionState` for pending/error states
- Revalidate cache with `revalidatePath` or `revalidateTag`
- Always validate input with Zod before processing

## Route Handlers (API Routes)

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Validate auth, fetch data, return response
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Validate, process, return
  return NextResponse.json(result, { status: 201 });
}
```

## Middleware

- Use `middleware.ts` at project root for auth checks
- Match routes with `config.matcher` array
- Redirect unauthenticated users to login
- Set headers for API routes (CORS, rate limiting)

## Performance

- Use `next/image` for all images
- Use `next/font` for font loading
- Dynamic imports for heavy components: `dynamic(() => import(...))`
- Implement streaming with nested Suspense boundaries
- Use Route Segment Config for per-route caching

## Environment Variables

- `NEXT_PUBLIC_*` for client-side variables
- Server-only variables: no prefix (never exposed to client)
- Validate with `@t3-oss/env-nextjs` at build time
- Use `.env.local` for local development

## Error Handling

- `error.tsx` at each route segment for granular boundaries
- `error.tsx` must be a Client Component (`'use client'`)
- Use `notFound()` for 404 responses
- Log errors to monitoring service in production
- Return structured error responses from API routes
