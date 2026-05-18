---
inclusion: always
description: React and TypeScript conventions for component development, hook patterns, and state management.
---

# React/TypeScript Conventions

## Component Structure

- Use functional components exclusively (no class components)
- Export component as default, types as named exports
- Props interface named `[Component]Props`
- Colocate tests with components (`Component.test.tsx`)

## File Organization

```
src/
  app/                 Next.js App Router pages
  components/
    ui/                shadcn/ui primitives
    [feature]/         Feature-specific components
  hooks/               Custom hooks (useX naming)
  lib/                 Utilities and helpers
  types/               Shared TypeScript types
```

## TypeScript Rules

- Strict mode enabled, no `any` types
- Use `interface` for component props, `type` for unions/intersections
- Prefer `unknown` over `any` for untyped data
- Use discriminated unions for complex state
- Generic components for reusable patterns

## Component Patterns

- Server Components by default (no directive needed)
- Add `'use client'` only when using hooks, events, or browser APIs
- Keep Client Components as leaf nodes
- Pass Server Component children to Client wrappers
- Use Suspense boundaries for async data

## State Management

- Local state: `useState` for simple, `useReducer` for complex
- Server state: TanStack Query or SWR
- Global state: Zustand (small stores, no single god store)
- URL state: `useSearchParams` for shareable state
- Form state: React Hook Form + Zod validation

## Naming Conventions

- Components: PascalCase (`UserProfile.tsx`)
- Hooks: camelCase with `use` prefix (`useAuth.ts`)
- Utilities: camelCase (`formatDate.ts`)
- Types: PascalCase (`UserProfile`, `ApiResponse`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- Files: kebab-case for non-component files (`api-client.ts`)
