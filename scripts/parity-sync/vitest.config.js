/**
 * Local Vitest config for `@kirokit/parity-sync`.
 *
 * The root `vitest.config.ts` scopes test discovery to
 * `packages/**\/tests/{unit,e2e,property,structural}/**\/*.test.ts`. This
 * package lives under `scripts/parity-sync/`, is pure CommonJS Node, and uses
 * `.test.js` files under `__tests__/`. We override include/exclude here so
 * `pnpm --filter @kirokit/parity-sync test` picks up the parity-sync tests
 * without polluting the monorepo defaults.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{design,tasks}.md
 */

'use strict';

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['__tests__/**/*.test.js'],
    exclude: ['**/node_modules/**', '**/fixtures/**'],
    environment: 'node',
    // Expose `describe`, `it`, `expect`, `beforeEach`, `afterEach` as globals
    // so test files can stay pure CommonJS without `require('vitest')` (which
    // is blocked under Vitest 2.x CJS).
    globals: true,
    // PBT (fast-check) properties run 100 iterations each + filesystem I/O,
    // so allow more headroom than the Vitest 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
  },
});
