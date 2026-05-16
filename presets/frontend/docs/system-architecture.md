# System Architecture

## Overview

This document describes the frontend application architecture built with Next.js App Router, React Server Components, and TypeScript.

## Architecture Diagram

```
Browser
  |
  v
Next.js Edge/Node Runtime
  |
  +-- App Router (file-based routing)
  |     +-- Layouts (persistent UI shells)
  |     +-- Pages (route segments)
  |     +-- Loading (Suspense fallbacks)
  |     +-- Error (error boundaries)
  |
  +-- Server Components (default)
  |     +-- Data fetching (direct DB/API access)
  |     +-- Static rendering
  |     +-- Streaming with Suspense
  |
  +-- Client Components ('use client')
  |     +-- Interactivity (events, state)
  |     +-- Browser APIs
  |     +-- Third-party client libraries
  |
  +-- Route Handlers (API layer)
        +-- REST endpoints
        +-- Server Actions (mutations)
```

## Key Architectural Decisions

### Server-First Rendering
- Server Components reduce client JavaScript bundle
- Data fetching happens on the server (no client waterfalls)
- Progressive enhancement for non-JS environments

### Component Architecture
- Atomic design: atoms, molecules, organisms, templates, pages
- Composition over inheritance
- Controlled/uncontrolled component patterns
- Compound components for complex UI widgets

### State Management
- Server state: TanStack Query (caching, revalidation)
- Client state: Zustand (minimal global stores)
- URL state: searchParams for shareable state
- Form state: React Hook Form + Zod

### Data Flow
- Top-down props for component trees
- Context for cross-cutting concerns (theme, auth)
- Server Actions for mutations (form submissions)
- Optimistic updates for responsive UI

## Directory Structure

```
project-root/
  src/
    app/               Route definitions
    components/        Reusable UI components
    hooks/             Custom React hooks
    lib/               Utilities and services
    types/             TypeScript definitions
  public/              Static assets
  tests/               Test utilities and fixtures
  e2e/                 End-to-end tests
```

## Performance Architecture

- Static generation for marketing pages
- ISR for content that changes periodically
- Streaming for data-heavy dashboards
- Edge runtime for latency-sensitive routes
- Image CDN with automatic format negotiation

## Security

- Server-only secrets (no NEXT_PUBLIC_ for sensitive data)
- CSRF protection via Server Actions
- Content Security Policy headers
- Input validation with Zod on both client and server
- Authentication via middleware (route protection)
