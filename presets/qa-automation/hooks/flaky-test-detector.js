#!/usr/bin/env node
// PostToolUse hook: warns when test code contains known flaky patterns.
// Checks for anti-patterns that cause intermittent failures.

const fs = require('fs');
const path = require('path');

const FLAKY_PATTERNS = [
  { pattern: /waitForTimeout\s*\(/i, message: 'waitForTimeout() causes flaky tests - use explicit waits' },
  { pattern: /Thread\.sleep\s*\(/i, message: 'Thread.sleep() causes flaky tests - use explicit waits' },
  { pattern: /waitForLoadState\s*\(\s*['"]networkidle['"]\s*\)/i, message: 'networkidle is unreliable - use specific wait conditions' },
  { pattern: /setTimeout\s*\(\s*resolve/i, message: 'Manual timeout promises cause flaky tests' },
  { pattern: /\.only\s*\(/i, message: '.only() left in test code - will skip other tests' },
];

const filePath = process.argv[2] || '';

if (!filePath || !fs.existsSync(filePath)) {
  process.exit(0);
}

const ext = path.extname(filePath).toLowerCase();
if (!['.ts', '.js', '.java', '.tsx', '.jsx'].includes(ext)) {
  process.exit(0);
}

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const warnings = [];

  for (const { pattern, message } of FLAKY_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(message);
    }
  }

  if (warnings.length > 0) {
    process.stderr.write(`[flaky-test-detector] Warnings in ${filePath}:\n`);
    warnings.forEach((w) => process.stderr.write(`  - ${w}\n`));
    process.exit(1);
  }
} catch (err) {
  // Silently ignore read errors
}

process.exit(0);
