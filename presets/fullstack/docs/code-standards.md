# Code Standards

## TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- No `any` types -- use `unknown` and narrow with type guards
- Explicit return types on exported functions
- Use `interface` for object shapes, `type` for unions/intersections
- Share types between client and server via `src/types/`

## React Components

- Functional components only (no class components)
- Server Components by default, Client Components only when needed
- Props interface exported separately from component
- Maximum 150 lines per component file
- Colocate tests with components

## Backend / API

- Layered architecture: handler -> service -> repository
- Validate all input with Zod at the handler layer
- Return consistent error response format
- Use parameterized queries (never string concatenation)
- Keep route handlers thin -- delegate to service layer

## File Organization

```
src/
  app/                 Next.js routes (pages, layouts, API)
  components/
    ui/                Base UI primitives (shadcn/ui)
    [feature]/         Feature-grouped components
  server/
    api/               tRPC routers or service layer
    db/                Database schema and queries
    auth/              Authentication configuration
  hooks/               Custom React hooks
  lib/                 Utilities, API clients, helpers
  types/               Shared TypeScript definitions
```

## Naming

- Files: kebab-case (`user-profile.tsx`, `api-client.ts`)
- Components: PascalCase (`UserProfile`)
- Hooks: camelCase with `use` prefix (`useAuth`)
- API routes: kebab-case paths (`/api/user-settings`)
- Database tables: snake_case (`user_profiles`)
- Environment variables: UPPER_SNAKE_CASE (`DATABASE_URL`)

## Testing

- Vitest as test runner
- React Testing Library for component tests
- Test behavior, not implementation details
- Playwright for E2E tests
- Colocate test files with source

## Error Handling

- Error boundaries at route segment level
- Try-catch for async operations with typed errors
- Structured error responses from API routes
- Log errors to monitoring service in production
- Never swallow errors silently

## Git Conventions

- Conventional commits: `type(scope): description`
- Branch naming: `feature/description`, `fix/description`
- PR titles under 72 characters
- Squash merge to main
