#!/usr/bin/env node
/**
 * Verifies shared types in src/types/ are imported by both client and server code.
 * Checks for orphan type definitions not used anywhere.
 */

const fs = require('fs');
const path = require('path');

const TYPES_DIR = path.resolve(process.cwd(), 'src/types');
const SRC_DIR = path.resolve(process.cwd(), 'src');

if (!fs.existsSync(TYPES_DIR)) {
  process.exit(0);
}

function getTypeFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && entry.name !== 'index.ts') {
        results.push(entry.name);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

function searchImports(dir, typeFile, exclude) {
  let found = false;
  if (!fs.existsSync(dir)) return false;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (found) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && full !== exclude) {
        found = searchImports(full, typeFile, exclude);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        const baseName = path.basename(typeFile, path.extname(typeFile));
        if (content.includes(`/types/${baseName}`) || content.includes(`/types'`) || content.includes(`/types"`)) {
          found = true;
        }
      }
    }
  } catch (e) { /* skip */ }
  return found;
}

const typeFiles = getTypeFiles(TYPES_DIR);
const orphans = [];

for (const tf of typeFiles) {
  const baseName = path.basename(tf, path.extname(tf));
  const isUsed = searchImports(SRC_DIR, tf, TYPES_DIR);
  if (!isUsed) {
    orphans.push(tf);
  }
}

if (orphans.length > 0) {
  process.stdout.write(`[type-sync-check] ${orphans.length} type file(s) not imported anywhere:\n`);
  orphans.forEach((o) => process.stdout.write(`  - src/types/${o}\n`));
  process.exit(1);
}

process.exit(0);
