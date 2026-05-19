#!/usr/bin/env node
/**
 * Checks that platform-specific files (*.ios.*, *.android.*) have matching
 * counterparts for both platforms.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIRS = ['src', 'lib', 'app'];
const PLATFORM_REGEX = /\.(ios|android)\./;

const cwd = process.cwd();

function findPlatformFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.dart_tool') {
        results.push(...findPlatformFiles(full));
      } else if (entry.isFile() && PLATFORM_REGEX.test(entry.name)) {
        results.push(full);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

let platformFiles = [];
for (const dir of SRC_DIRS) {
  platformFiles.push(...findPlatformFiles(path.resolve(cwd, dir)));
}

if (platformFiles.length === 0) {
  process.exit(0);
}

const missing = [];
for (const file of platformFiles) {
  const dir = path.dirname(file);
  const name = path.basename(file);

  let counterpart;
  if (name.includes('.ios.')) {
    counterpart = name.replace('.ios.', '.android.');
  } else {
    counterpart = name.replace('.android.', '.ios.');
  }

  const counterpartPath = path.join(dir, counterpart);
  if (!fs.existsSync(counterpartPath)) {
    missing.push({
      file: path.relative(cwd, file),
      expected: path.relative(cwd, counterpartPath),
    });
  }
}

if (missing.length > 0) {
  process.stdout.write(`[platform-parity-check] ${missing.length} file(s) missing platform counterpart:\n`);
  missing.slice(0, 10).forEach((m) => {
    process.stdout.write(`  - ${m.file} (missing: ${m.expected})\n`);
  });
  if (missing.length > 10) {
    process.stdout.write(`  ... and ${missing.length - 10} more\n`);
  }
  process.exit(1);
}

process.exit(0);
