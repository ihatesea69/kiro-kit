#!/usr/bin/env node
// PostToolUse hook: checks test coverage meets minimum thresholds.
// Warns if coverage drops below configured minimum.

const fs = require('fs');
const path = require('path');

const MIN_COVERAGE = parseInt(process.env.MIN_COVERAGE || '80', 10);
const COVERAGE_FILE = process.env.COVERAGE_FILE || 'coverage/coverage-summary.json';

const coveragePath = path.resolve(process.cwd(), COVERAGE_FILE);

if (!fs.existsSync(coveragePath)) {
  // No coverage file, skip check
  process.exit(0);
}

try {
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  const total = coverage.total;

  if (!total) {
    process.exit(0);
  }

  const lines = total.lines ? total.lines.pct : 100;
  const branches = total.branches ? total.branches.pct : 100;

  if (lines < MIN_COVERAGE || branches < MIN_COVERAGE) {
    process.stderr.write(
      `[test-coverage-check] Coverage below threshold (${MIN_COVERAGE}%): Lines=${lines}%, Branches=${branches}%\n`
    );
    process.exit(1);
  }

  process.stdout.write(`[test-coverage-check] Coverage OK: Lines=${lines}%, Branches=${branches}%\n`);
} catch (err) {
  // Silently ignore parse errors
}

process.exit(0);
