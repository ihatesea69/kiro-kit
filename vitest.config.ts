import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration for the KK-Kiro-Kit monorepo.
 *
 * Test layout (per design.md):
 *   packages/<pkg>/tests/unit/**       - fast unit tests for core modules
 *   packages/<pkg>/tests/e2e/**        - end-to-end CLI tests (slower)
 *   packages/<pkg>/tests/property/**   - property-based tests (fast-check)
 *   packages/<pkg>/tests/structural/** - structural assertions over preset bundles
 *   packages/<pkg>/tests/fixtures/**   - test data, NOT collected as tests
 *
 * Coverage targets package source only (packages/<pkg>/src/**).
 *
 * NOTE: This file imports from `vitest/config`. The `vitest` devDependency is
 * intentionally not yet installed at this stage of the bootstrap (task 1.3).
 * The file is valid TypeScript and will resolve correctly once vitest is
 * added in a later task.
 *
 * _Requirements: 22.1_
 */
export default defineConfig({
  test: {
    // Discover tests across all workspace packages, partitioned by category.
    include: ['packages/**/tests/{unit,e2e,property,structural}/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/fixtures/**'],

    // Node-only runtime (CLI tooling, no DOM).
    environment: 'node',

    // Use explicit imports for `describe`, `it`, `expect`, etc.
    globals: false,

    // E2E CLI tests can spawn child processes and touch the filesystem,
    // so we lift the per-test timeout from the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // Reporter defaults are fine; keep output minimal-but-useful in CI.
    reporters: ['default'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/tests/**',
        '**/node_modules/**',
        '**/dist/**',
      ],
      // Emit reports under <root>/coverage so .gitignore (task 1.4) can
      // exclude them with a single rule.
      reportsDirectory: './coverage',
      all: false,
    },
  },
});
