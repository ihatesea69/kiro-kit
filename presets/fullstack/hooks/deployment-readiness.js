#!/usr/bin/env node
/**
 * Pre-deployment checklist: checks for .env.example completeness,
 * build success indicators, and no TODO/FIXME in production code.
 */

const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const issues = [];

// Check .env.example exists
const envExample = path.resolve(cwd, '.env.example');
const envLocal = path.resolve(cwd, '.env.local');
if (!fs.existsSync(envExample)) {
  issues.push('Missing .env.example file');
} else if (fs.existsSync(envLocal)) {
  // Check all keys in .env.local are documented in .env.example
  const exampleKeys = fs.readFileSync(envExample, 'utf8')
    .split('\n')
    .filter((l) => l.match(/^[A-Z_]+=/) )
    .map((l) => l.split('=')[0]);
  const localKeys = fs.readFileSync(envLocal, 'utf8')
    .split('\n')
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => l.split('=')[0]);
  const undocumented = localKeys.filter((k) => !exampleKeys.includes(k));
  if (undocumented.length > 0) {
    issues.push(`${undocumented.length} env var(s) in .env.local not in .env.example`);
  }
}

// Check for TODO/FIXME in src/
function scanTodos(dir, depth) {
  let count = 0;
  if (depth > 5 || !fs.existsSync(dir)) return 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
        count += scanTodos(full, depth + 1);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        const matches = content.match(/\b(TODO|FIXME)\b/g);
        if (matches) count += matches.length;
      }
    }
  } catch (e) { /* skip */ }
  return count;
}

const todoCount = scanTodos(path.resolve(cwd, 'src'), 0);
if (todoCount > 0) {
  issues.push(`${todoCount} TODO/FIXME comment(s) found in src/`);
}

// Check build output exists
const buildDirs = ['.next', 'dist', 'build'];
const hasBuild = buildDirs.some((d) => fs.existsSync(path.resolve(cwd, d)));
if (!hasBuild) {
  issues.push('No build output found. Run build before deploying.');
}

if (issues.length > 0) {
  process.stdout.write('[deployment-readiness] Pre-deployment issues:\n');
  issues.forEach((i) => process.stdout.write(`  - ${i}\n`));
  process.exit(1);
}

process.stdout.write('[deployment-readiness] All checks passed.\n');
process.exit(0);
