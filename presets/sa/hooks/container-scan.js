#!/usr/bin/env node
/**
 * Checks Dockerfile for security best practices: non-root user,
 * no latest tag, and multi-stage build usage.
 */

const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const DOCKERFILE_NAMES = ['Dockerfile', 'dockerfile', 'Containerfile'];

function findDockerfiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (DOCKERFILE_NAMES.includes(entry.name) || entry.name.startsWith('Dockerfile.'))) {
        results.push(path.join(dir, entry.name));
      } else if (entry.isDirectory() && !['node_modules', '.git', '.terraform'].includes(entry.name)) {
        results.push(...findDockerfiles(path.join(dir, entry.name)));
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

const dockerfiles = findDockerfiles(cwd);

if (dockerfiles.length === 0) {
  process.exit(0);
}

const issues = [];

for (const df of dockerfiles) {
  const content = fs.readFileSync(df, 'utf8');
  const rel = path.relative(cwd, df);
  const lines = content.split('\n');

  // Check for latest tag
  const fromLines = lines.filter((l) => /^\s*FROM\s+/i.test(l));
  for (const line of fromLines) {
    if (/:latest\b/.test(line) || (/^\s*FROM\s+\S+\s*/i.test(line) && !/:/.test(line) && !/\s+AS\s+/i.test(line.split(/\s+/).slice(2).join(' ')))) {
      if (!/:/.test(line.split(/\s+/)[1] || '')) {
        issues.push(`${rel}: FROM without pinned version tag`);
      }
    }
    if (/:latest/.test(line)) {
      issues.push(`${rel}: Uses :latest tag (pin a specific version)`);
    }
  }

  // Check for non-root user
  const hasUser = /^\s*USER\s+(?!root)/im.test(content);
  if (!hasUser) {
    issues.push(`${rel}: No non-root USER directive found`);
  }

  // Check for multi-stage build
  if (fromLines.length < 2) {
    issues.push(`${rel}: Single-stage build (consider multi-stage for smaller images)`);
  }
}

if (issues.length > 0) {
  process.stdout.write('[container-scan] Dockerfile security issues:\n');
  issues.forEach((i) => process.stdout.write(`  - ${i}\n`));
  process.exit(1);
}

process.stdout.write('[container-scan] All Dockerfiles pass security checks.\n');
process.exit(0);
