import { defineConfig } from 'vitest/config';

/**
 * Package-local Vitest configuration for packages/cli.
 *
 * The root vitest.config.ts globs `packages/** /tests/...`, which only resolves
 * when vitest runs from the repo root. `pnpm run test` runs with cwd =
 * packages/cli, where that glob matches nothing and vitest exits 1 with
 * "No test files found". This config uses package-relative paths so the
 * package's own `test` script works, matching the convention already used by
 * vitest.structural.config.ts.
 */
export default defineConfig({
  test: {
    include: ['tests/{unit,e2e,property,structural}/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/fixtures/**'],

    environment: 'node',
    globals: false,

    // E2E CLI tests spawn child processes and touch the filesystem.
    testTimeout: 30_000,
    hookTimeout: 30_000,

    reporters: ['default'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/tests/**', '**/node_modules/**', '**/dist/**'],
      reportsDirectory: './coverage',
      all: false,
    },
  },
});
