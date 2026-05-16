---
name: web-frameworks
description: Build full-stack web applications with Next.js App Router, Server Components, and React patterns. Use when working with routing, rendering, or data fetching.
---

# Web Frameworks

Activate when working with Next.js App Router, routing, rendering strategies, or full-stack React patterns.

## When to Use

- Setting up Next.js App Router routes and layouts
- Implementing Server Components and Server Actions
- Configuring rendering strategies (SSR, SSG, ISR, PPR)
- Working with middleware and route handlers
- Optimizing with streaming and Suspense

## Next.js App Router

- File-based routing in `app/` directory
- `page.tsx` defines route segments
- `layout.tsx` wraps child routes (persists across navigation)
- `loading.tsx` provides Suspense fallback
- `error.tsx` handles errors at segment level
- Route groups `(name)` for organization without URL impact

## Server Components (default)

- No `use client` directive needed
- Can fetch data directly (async components)
- Cannot use hooks, event handlers, or browser APIs
- Reduce client bundle size significantly

## Server Actions

- Define with `use server` directive
- Use for form submissions and mutations
- Integrate with `useActionState` for pending/error states
- Revalidate cache with `revalidatePath` or `revalidateTag`
