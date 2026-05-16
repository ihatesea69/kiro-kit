---
name: frontend-development
description: Build React/Next.js components, pages, and features with TypeScript. Use when implementing frontend UI, hooks, state management, or client-side logic.
---

# Frontend Development

Activate when building React components, pages, hooks, or client-side features.

## When to Use

- Implementing React components with TypeScript
- Building Next.js pages with rendering strategies
- Creating custom hooks for reusable logic
- Integrating with APIs using TanStack Query or SWR
- Optimizing performance (code splitting, memoization)

## Patterns

- Functional components with hooks exclusively
- Server Components by default, Client Components only when needed
- Colocate related files (component, test, types)
- Use Suspense for async data loading
- Single responsibility principle for components
- Keep components under 150 lines

## State Management

- Local state: useState for simple, useReducer for complex
- Server state: TanStack Query or SWR
- Global state: Zustand (small stores)
- URL state: useSearchParams for shareable state
- Form state: React Hook Form + Zod validation
