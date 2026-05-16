---
name: web-frameworks
description: Build modern full-stack web applications with Next.js App Router, Server Components, and React patterns. Use when working with Next.js routing, rendering, or data fetching.
---

# Web Frameworks

Activate this skill when working with Next.js App Router, routing, rendering strategies, or full-stack React patterns.

## When to Use

- Setting up Next.js App Router routes and layouts
- Implementing Server Components and Server Actions
- Configuring rendering strategies (SSR, SSG, ISR, PPR)
- Working with middleware and route handlers
- Implementing authentication flows
- Optimizing with streaming and Suspense

## Next.js App Router

- File-based routing in `app/` directory
- `page.tsx` defines route segments
- `layout.tsx` wraps child routes (persists across navigation)
- `loading.tsx` provides Suspense fallback
- `error.tsx` handles errors at segment level
- `not-found.tsx` for 404 handling
- Route groups `(name)` for organization without URL impact

## Server Components (default)

- No `use client` directive needed
- Can fetch data directly (async components)
- Cannot use hooks, event handlers, or browser APIs
- Reduce client bundle size significantly
- Use for data display, layouts, and static content

## Client Components

- Add `use client` at top of file
- Required for: hooks, event handlers, browser APIs, state
- Keep as small as possible (leaf components)
- Pass Server Component children as props when possible

## Server Actions

- Define with `use server` directive
- Use for form submissions and mutations
- Integrate with `useActionState` for pending/error states
- Revalidate cache with `revalidatePath` or `revalidateTag`

## Rendering Strategies

- Static (default): pre-rendered at build time
- Dynamic: rendered per-request (use `cookies()`, `headers()`, or `searchParams`)
- ISR: static with timed revalidation (`revalidate` option)
- Streaming: progressive rendering with Suspense boundaries
