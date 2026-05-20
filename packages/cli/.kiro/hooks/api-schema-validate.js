#!/usr/bin/env node
/**
 * Validates that route handler files export proper HTTP method handlers
 * and use input validation (checks for zod/joi imports in route files).
 */

const fs = require('fs');
const path = require('path');

const ROUTE_DIRS = ['src/app/api', 'src/routes', 'routes', 'api'];
const ROUTE_FILES = ['route.ts', 'route.js', 'index.ts', 'index.js'];
const VALIDATION_PATTERNS = [/from\s+['"]zod['"]/, /from\s+['"]joi['"]/, /require\(['"]zod['"]\)/, /require\(['"]joi['"]\)/];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const cwd = process.cwd();
const issues = [];

function findRouteFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findRouteFiles(full));
      } else if (ROUTE_FILES.includes(entry.name)) {
        results.push(full);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

let routeFiles = [];
for (const dir of ROUTE_DIRS) {
  routeFiles.push(...findRouteFiles(path.resolve(cwd, dir)));
}

if (routeFiles.length === 0) {
  process.exit(0);
}

for (const file of routeFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(cwd, file);

  // Check for exported HTTP method handlers
  const hasMethod = HTTP_METHODS.some((m) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(content)
  );
  if (!hasMethod) {
    issues.push(`${rel}: No exported HTTP method handler found (GET, POST, etc.)`);
    continue;
  }

  // Check for input validation on POST/PUT/PATCH handlers
  const hasMutation = ['POST', 'PUT', 'PATCH'].some((m) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(content)
  );
  if (hasMutation) {
    const hasValidation = VALIDATION_PATTERNS.some((p) => p.test(content));
    if (!hasValidation) {
      issues.push(`${rel}: Mutation handler without input validation (zod/joi not imported)`);
    }
  }
}

if (issues.length > 0) {
  process.stdout.write('[api-schema-validate] Issues found:\n');
  issues.forEach((i) => process.stdout.write(`  - ${i}\n`));
  process.exit(1);
}

process.exit(0);
