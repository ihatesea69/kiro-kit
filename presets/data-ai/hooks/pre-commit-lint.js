#!/usr/bin/env node
// Pre-commit hook: runs linter on staged files.
// Exits non-zero if lint fails, preventing commit.

const { execSync } = require('child_process');

try {
  execSync('npm run lint --silent', { stdio: 'pipe' });
  process.exit(0);
} catch (err) {
  process.stderr.write('[pre-commit-lint] Lint failed. Fix errors before committing.\n');
  if (err.stdout) process.stderr.write(err.stdout.toString());
  if (err.stderr) process.stderr.write(err.stderr.toString());
  process.exit(1);
}
