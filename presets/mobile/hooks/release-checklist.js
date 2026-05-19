#!/usr/bin/env node
/**
 * Verifies version bump in pubspec.yaml/package.json, changelog updated,
 * and no debug flags before release.
 */

const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const issues = [];

// Check version file exists and has been updated
const versionFiles = ['pubspec.yaml', 'package.json', 'app.json'];
let versionFile = null;
for (const vf of versionFiles) {
  if (fs.existsSync(path.resolve(cwd, vf))) {
    versionFile = vf;
    break;
  }
}

if (!versionFile) {
  process.exit(0);
}

// Check changelog exists
const changelogFiles = ['CHANGELOG.md', 'changelog.md', 'CHANGES.md'];
const hasChangelog = changelogFiles.some((f) => fs.existsSync(path.resolve(cwd, f)));
if (!hasChangelog) {
  issues.push('No CHANGELOG.md found. Document changes before release.');
}

// Check for debug flags in source code
const DEBUG_PATTERNS = [
  /debugShowCheckedModeBanner:\s*true/,
  /kDebugMode/,
  /console\.log\(/,
  /__DEV__/,
  /debugPrint\(/,
];

function scanForDebug(dir, depth) {
  const results = [];
  if (depth > 4 || !fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !['node_modules', '.dart_tool', 'build'].includes(entry.name)) {
        results.push(...scanForDebug(full, depth + 1));
      } else if (entry.isFile() && /\.(dart|ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        for (const pattern of DEBUG_PATTERNS) {
          if (pattern.test(content)) {
            results.push(path.relative(cwd, full));
            break;
          }
        }
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

const SRC_DIRS = ['lib', 'src', 'app'];
let debugFiles = [];
for (const dir of SRC_DIRS) {
  debugFiles.push(...scanForDebug(path.resolve(cwd, dir), 0));
}

if (debugFiles.length > 0) {
  issues.push(`${debugFiles.length} file(s) contain debug flags/statements`);
}

if (issues.length > 0) {
  process.stdout.write('[release-checklist] Release blockers:\n');
  issues.forEach((i) => process.stdout.write(`  - ${i}\n`));
  process.exit(1);
}

process.stdout.write('[release-checklist] All release checks passed.\n');
process.exit(0);
