---
inclusion: always
description: Fullstack conventions for Next.js/T3 stack covering both frontend components and backend API routes, data layer, and shared types.
---

# Fullstack Conventions

## Project Structure

```
src/
  app/                 Next.js App Router (pages, layouts, API routes)
  components/
    ui/                shadcn/ui primitives
    [feature]/         Feature-specific components
  server/
    api/               tRPC routers or REST handlers
    db/                Database schema and queries
    services/          Business logic layer
    auth/              Authentication configuration
  hooks/               Custom React hooks
  lib/                 Shared utilities (client + server)
  types/               Shared TypeScript definitions
  env.ts               Environment variable validation
prisma/                Prisma schema and migrations (if using Prisma)
drizzle/               Drizzle schema and migrations (if using Drizzle)
```

## TypeScript Rules

- Strict mode enabled, no `any` types
- Use `interface` for component props, `type` for unions/intersections
- Share types between client and server via `src/types/`
- Validate environment variables at build time with `@t3-oss/env-nextjs`
- Use Zod schemas for runtime validation on both client and server

## Frontend Conventions

- Server Components by default (no directive needed)
- Add `'use client'` only when using hooks, events, or browser APIs
- Keep Client Components as leaf nodes
- Use Suspense boundaries for async data loading
- Style with Tailwind CSS utility classes
- Use `cn()` helper for conditional classes

## Backend Conventions

- Layered architecture: handler -> service -> repository
- Validate all input at the handler layer (Zod)
- Return consistent error response format
- Use parameterized queries for all database operations
- Implement proper HTTP status codes
- Keep route handlers thin -- delegate to service layer

## Data Layer

- Define schema in a single source of truth (Prisma/Drizzle)
- Use migrations for all schema changes (never manual DDL)
- Create indexes based on query patterns
- Use transactions for multi-table operations
- Soft delete where audit trail is needed

## Authentication

- Use middleware for route protection
- Server-only secrets (no NEXT_PUBLIC_ for sensitive data)
- Session validation on every protected API route
- RBAC checks at the service layer

## Naming Conventions

- Components: PascalCase (`UserProfile.tsx`)
- API routes: kebab-case (`/api/user-settings`)
- Database tables: snake_case (`user_profiles`)
- TypeScript types: PascalCase (`UserProfile`)
- Environment variables: UPPER_SNAKE_CASE (`DATABASE_URL`)
- Files: kebab-case for non-component files (`api-client.ts`)
