# Code Standards

## TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- No `any` types -- use `unknown` and narrow with type guards
- Explicit return types on exported functions
- Use `interface` for object shapes, `type` for unions/intersections
- Prefer `const` assertions for literal types

## React Components

- Functional components only (no class components)
- Props interface exported separately from component
- Default export for page/layout components
- Named exports for shared/utility components
- Maximum 150 lines per component file

## File Organization

```
src/
  app/                 Next.js routes (pages, layouts, API)
  components/
    ui/                Base UI primitives (shadcn/ui)
    [feature]/         Feature-grouped components
  hooks/               Custom React hooks
  lib/                 Utilities, API clients, helpers
  types/               Shared TypeScript definitions
  styles/              Global styles and Tailwind config
```

## Naming

- Files: kebab-case (`user-profile.tsx`, `use-auth.ts`)
- Components: PascalCase (`UserProfile`)
- Hooks: camelCase with `use` prefix (`useAuth`)
- Utilities: camelCase (`formatDate`)
- Types/Interfaces: PascalCase (`UserProfile`)
- Constants: UPPER_SNAKE_CASE (`API_BASE_URL`)

## Styling

- Tailwind CSS utility classes as primary styling method
- Use `cn()` helper for conditional classes (clsx + tailwind-merge)
- CSS variables for theme tokens (defined in globals.css)
- No inline styles except for dynamic values
- Responsive: mobile-first with Tailwind breakpoint prefixes

## Testing

- Colocate test files with source (`Component.test.tsx`)
- Use Vitest as test runner
- React Testing Library for component tests
- Test behavior, not implementation details
- Playwright for E2E tests in `e2e/` directory

## Error Handling

- Error boundaries at route segment level
- Try-catch for async operations with typed errors
- User-facing error messages must be actionable
- Log errors to monitoring service in production
- Never swallow errors silently

## Performance

- Server Components by default (no unnecessary client JS)
- Dynamic imports for heavy components
- Image optimization with next/image
- Font optimization with next/font
- Measure before optimizing (no premature optimization)

## Git Conventions

- Conventional commits: `type(scope): description`
- Branch naming: `feature/description`, `fix/description`
- PR titles under 72 characters
- Squash merge to main
