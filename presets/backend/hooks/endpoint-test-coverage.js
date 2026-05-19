#!/usr/bin/env node
/**
 * Checks that API route files in src/app/api/ or routes/ have corresponding test files.
 */

const fs = require('fs');
const path = require('path');

const ROUTE_DIRS = ['src/app/api', 'src/routes', 'routes'];
const TEST_DIRS = ['__tests__', 'tests', 'test'];
const ROUTE_FILES = ['route.ts', 'route.js', 'index.ts', 'index.js'];

const cwd = process.cwd();

function findRoutes(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findRoutes(full));
      } else if (ROUTE_FILES.includes(entry.name)) {
        results.push({ file: full, dir: path.dirname(full) });
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

let routes = [];
for (const dir of ROUTE_DIRS) {
  routes.push(...findRoutes(path.resolve(cwd, dir)));
}

if (routes.length === 0) {
  process.exit(0);
}

const missing = [];

for (const route of routes) {
  const routeDir = route.dir;
  const routeRel = path.relative(cwd, routeDir);
  const routeName = path.basename(routeDir);

  // Look for test files in various locations
  const testPatterns = [
    path.join(routeDir, `route.test.ts`),
    path.join(routeDir, `route.test.js`),
    path.join(routeDir, `${routeName}.test.ts`),
    path.join(routeDir, `${routeName}.test.js`),
  ];

  // Also check parent __tests__ directories
  for (const testDir of TEST_DIRS) {
    testPatterns.push(path.join(routeDir, '..', testDir, `${routeName}.test.ts`));
    testPatterns.push(path.join(routeDir, '..', testDir, `${routeName}.test.js`));
  }

  const hasTest = testPatterns.some((t) => fs.existsSync(t));
  if (!hasTest) {
    missing.push(routeRel);
  }
}

if (missing.length > 0) {
  process.stdout.write(`[endpoint-test-coverage] ${missing.length} API route(s) without tests:\n`);
  missing.slice(0, 10).forEach((m) => process.stdout.write(`  - ${m}\n`));
  if (missing.length > 10) {
    process.stdout.write(`  ... and ${missing.length - 10} more\n`);
  }
  process.exit(1);
}

process.exit(0);
