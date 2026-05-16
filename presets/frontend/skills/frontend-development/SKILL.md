---
name: frontend-development
description: Build robust frontend systems with React, Next.js, and TypeScript. Use when implementing components, hooks, data fetching, state management, or optimizing frontend performance.
---

# Frontend Development

Activate this skill when implementing React/Next.js features with TypeScript.

## When to Use

- Implementing React components (Server or Client)
- Creating custom hooks for reusable logic
- Setting up data fetching with TanStack Query or SWR
- Managing application state (Zustand, Jotai, or React Context)
- Optimizing rendering performance
- Implementing form handling with React Hook Form + Zod

## React Patterns

- Prefer Server Components by default; use Client Components only when needed
- Use composition over prop drilling
- Implement error boundaries at route segments
- Use Suspense for async data loading
- Keep components focused (single responsibility)
- Extract complex logic into custom hooks

## TypeScript Standards

- Strict mode enabled, no `any` types
- Explicit prop interfaces for all components
- Use generics for reusable utilities
- Discriminated unions for complex state
- Proper event handler typing (React.MouseEvent, etc.)

## Data Fetching

- Server Components: fetch directly with proper caching
- Client Components: TanStack Query or SWR for cache management
- Implement optimistic updates for mutations
- Handle loading, error, and empty states explicitly
- Use Suspense boundaries for streaming

## Performance

- Dynamic imports for route-level code splitting
- React.memo only where measured benefit exists
- useMemo/useCallback for expensive computations or stable references
- Virtualize long lists (TanStack Virtual)
- Optimize images with next/image
