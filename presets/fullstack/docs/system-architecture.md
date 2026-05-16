# System Architecture

## Overview

Full-stack application built with Next.js App Router, combining React Server Components for the frontend with API routes and Server Actions for the backend, backed by PostgreSQL.

## Architecture Diagram

```
Browser
  |
  v
Next.js Runtime (Edge/Node)
  |
  +-- App Router (file-based routing)
  |     +-- Layouts (persistent UI shells)
  |     +-- Pages (route segments)
  |     +-- Loading/Error (Suspense + boundaries)
  |
  +-- Server Components (default)
  |     +-- Direct database access
  |     +-- Streaming with Suspense
  |
  +-- Client Components ('use client')
  |     +-- Interactivity, state, browser APIs
  |
  +-- API Layer
  |     +-- Route Handlers (REST)
  |     +-- Server Actions (mutations)
  |     +-- tRPC (optional, type-safe RPC)
  |
  +-- Service Layer
  |     +-- Business logic
  |     +-- Validation (Zod)
  |     +-- Authorization
  |
  +-- Data Layer
        +-- ORM (Prisma/Drizzle)
        +-- PostgreSQL
        +-- Redis (caching, sessions)
```

## Key Architectural Decisions

### Server-First Rendering
- Server Components reduce client JavaScript bundle
- Data fetching on the server eliminates client waterfalls
- Progressive enhancement for non-JS environments

### Shared Validation
- Zod schemas shared between client forms and server handlers
- Single source of truth for data shape
- Runtime validation at every boundary

### Authentication
- Middleware-based route protection
- Session stored server-side (database or Redis)
- RBAC checks in service layer

### Data Flow
- Server Components fetch data directly (no API call needed)
- Client mutations via Server Actions or API routes
- Optimistic updates for responsive UI
- Cache revalidation via tags or paths

## Directory Structure

```
project-root/
  src/
    app/               Route definitions and API
    components/        Reusable UI components
    server/            Backend logic (services, db, auth)
    hooks/             Custom React hooks
    lib/               Shared utilities
    types/             TypeScript definitions
  prisma/              Schema and migrations
  public/              Static assets
  e2e/                 End-to-end tests
```

## Performance Architecture

- Static generation for marketing pages
- ISR for content that changes periodically
- Streaming for data-heavy dashboards
- Edge runtime for latency-sensitive routes
- Redis caching for expensive queries
- Connection pooling for database

## Security

- Server-only secrets (no NEXT_PUBLIC_ for sensitive data)
- CSRF protection via Server Actions
- Input validation with Zod on both client and server
- Parameterized queries via ORM (no raw SQL injection)
- Rate limiting on public API endpoints
