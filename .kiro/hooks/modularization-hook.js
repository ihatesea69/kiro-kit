#!/usr/bin/env node
// PostToolUse hook: warns when a file exceeds 200 lines.
// Encourages splitting large files into smaller modules.

const fs = require('fs');
const path = require('path');

const MAX_LINES = 200;
const CODE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'];

const filePath = process.argv[2] || '';

if (!filePath || !fs.existsSync(filePath)) {
  process.exit(0);
}

const ext = path.extname(filePath).toLowerCase();
if (!CODE_EXTENSIONS.includes(ext)) {
  process.exit(0);
}

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lineCount = content.split('\n').length;

  if (lineCount > MAX_LINES) {
    process.stderr.write(
      `[modularization] Warning: ${filePath} has ${lineCount} lines (max ${MAX_LINES}). Consider splitting.\n`
    );
    process.exit(1);
  }
} catch (err) {
  // Silently ignore read errors
}

process.exit(0);
