#!/usr/bin/env node
/**
 * Checks if bundle analysis data exists and warns if total size exceeds threshold.
 * Looks for .next/analyze/ or build stats files.
 */

const fs = require('fs');
const path = require('path');

const THRESHOLD_KB = 500;
const ANALYZE_PATHS = [
  '.next/analyze/client.html',
  '.next/analyze/nodejs.html',
  'build/bundle-stats.json',
  'dist/stats.json',
  'stats.json',
];

const cwd = process.cwd();
let found = false;

for (const rel of ANALYZE_PATHS) {
  const full = path.resolve(cwd, rel);
  if (fs.existsSync(full)) {
    found = true;
    break;
  }
}

if (!found) {
  // Check .next build manifest for size info
  const buildManifest = path.resolve(cwd, '.next/build-manifest.json');
  if (!fs.existsSync(buildManifest)) {
    process.exit(0);
  }
}

// Check total size of JS output
const outputDirs = ['.next/static/chunks', 'dist', 'build/static/js'];
let totalBytes = 0;

for (const dir of outputDirs) {
  const full = path.resolve(cwd, dir);
  if (!fs.existsSync(full)) continue;
  try {
    const files = fs.readdirSync(full);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const stat = fs.statSync(path.join(full, file));
        totalBytes += stat.size;
      }
    }
  } catch (e) { /* skip */ }
}

if (totalBytes === 0) {
  process.exit(0);
}

const totalKB = Math.round(totalBytes / 1024);

if (totalKB > THRESHOLD_KB) {
  process.stdout.write(
    `[bundle-size-guard] Warning: Total JS bundle size is ${totalKB}KB (threshold: ${THRESHOLD_KB}KB).\n` +
    '  Consider code splitting, lazy loading, or removing unused dependencies.\n'
  );
  process.exit(1);
}

process.stdout.write(`[bundle-size-guard] Bundle size OK: ${totalKB}KB (threshold: ${THRESHOLD_KB}KB).\n`);
process.exit(0);
