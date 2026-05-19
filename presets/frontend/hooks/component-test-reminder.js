#!/usr/bin/env node
/**
 * Checks if components in src/components/ have corresponding .test.tsx files.
 * Warns about components missing test coverage.
 */

const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.resolve(process.cwd(), 'src/components');
const COMPONENT_EXTENSIONS = ['.tsx', '.jsx'];
const IGNORE_DIRS = ['ui', 'node_modules', '__tests__'];

if (!fs.existsSync(COMPONENTS_DIR)) {
  process.exit(0);
}

function getComponentFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !IGNORE_DIRS.includes(entry.name)) {
        results.push(...getComponentFiles(full));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const base = path.basename(entry.name, ext);
        if (COMPONENT_EXTENSIONS.includes(ext) && !base.endsWith('.test') && !base.endsWith('.spec')) {
          // Only count PascalCase files as components
          if (/^[A-Z]/.test(base)) {
            results.push(full);
          }
        }
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

const components = getComponentFiles(COMPONENTS_DIR);
const missing = [];

for (const comp of components) {
  const dir = path.dirname(comp);
  const ext = path.extname(comp);
  const base = path.basename(comp, ext);

  const testPatterns = [
    path.join(dir, `${base}.test.tsx`),
    path.join(dir, `${base}.test.jsx`),
    path.join(dir, `${base}.spec.tsx`),
    path.join(dir, '__tests__', `${base}.test.tsx`),
  ];

  const hasTest = testPatterns.some((t) => fs.existsSync(t));
  if (!hasTest) {
    missing.push(path.relative(process.cwd(), comp));
  }
}

if (missing.length > 0) {
  process.stdout.write(`[component-test-reminder] ${missing.length} component(s) without tests:\n`);
  missing.slice(0, 10).forEach((m) => process.stdout.write(`  - ${m}\n`));
  if (missing.length > 10) {
    process.stdout.write(`  ... and ${missing.length - 10} more\n`);
  }
  process.exit(1);
}

process.exit(0);
