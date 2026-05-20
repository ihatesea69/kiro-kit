---
inclusion: manual
description: TypeScript conventions and best practices for Playwright test automation including strict typing, async patterns, and project structure.
---

# Playwright TypeScript Conventions

## TypeScript Standards

- Use strict TypeScript configuration (strict: true)
- Never use `any` type; prefer unknown or proper interfaces
- Define interfaces for all page objects and test data
- Use const assertions for literal types
- Export types alongside implementations

## Project Structure

```
tests/
  fixtures/       - Custom test fixtures
  pages/          - Page Object Model classes
  specs/          - Test specification files
  data/           - External test data files
  utils/          - Shared utilities
playwright.config.ts
```

## Async Patterns

- All test code is async/await
- Never use .then() chains in test code
- Handle Promise.all for parallel operations
- Use proper error handling with try/catch where needed

## Playwright Specifics

- Import test and expect from fixtures, not @playwright/test directly
- Use custom fixtures for dependency injection
- Selector priority: getByRole > getByLabel > getByPlaceholder > getByText > getByTestId > CSS
- Use web-first assertions: await expect(locator).toBeVisible()
- Wrap logical groups in test.step()
- Never use page.waitForTimeout()
- Never use waitForLoadState('networkidle')
- Never use XPath selectors

## Naming Conventions

- Test files: feature-name.spec.ts
- Page objects: FeaturePage.ts (PascalCase)
- Fixtures: test-base.ts
- Data files: feature-name.data.ts
- Test descriptions: should + expected behavior
