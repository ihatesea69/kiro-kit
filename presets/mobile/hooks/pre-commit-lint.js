#!/usr/bin/env node
// Pre-commit hook: runs linter/analyzer on the project.
// Exits non-zero if analysis fails, preventing commit.

const { execSync } = require('child_process');
const fs = require('fs');

// Detect project type and run appropriate linter
let command = '';
if (fs.existsSync('pubspec.yaml')) {
  command = 'dart analyze';
} else if (fs.existsSync('package.json')) {
  command = 'npm run lint --silent';
} else {
  process.exit(0);
}

try {
  execSync(command, { stdio: 'pipe' });
  process.exit(0);
} catch (err) {
  process.stderr.write('[pre-commit-lint] Analysis failed. Fix errors before committing.\n');
  if (err.stdout) process.stderr.write(err.stdout.toString());
  if (err.stderr) process.stderr.write(err.stderr.toString());
  process.exit(1);
}
