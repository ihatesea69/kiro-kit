#!/usr/bin/env node
/**
 * Checks for common accessibility issues in .tsx/.jsx files.
 * Scans for missing alt attributes, missing aria-labels, and missing lang attribute.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(process.cwd(), 'src');
const EXTENSIONS = ['.tsx', '.jsx'];

if (!fs.existsSync(SRC_DIR)) {
  process.exit(0);
}

function getFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        results.push(...getFiles(full));
      } else if (EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return results;
}

const issues = [];
const files = getFiles(SRC_DIR);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);

  // Check for <img> without alt
  const imgNoAlt = content.match(/<img(?![^>]*\balt\b)[^>]*>/g);
  if (imgNoAlt) {
    issues.push(`${rel}: ${imgNoAlt.length} <img> tag(s) missing alt attribute`);
  }

  // Check for interactive elements without aria-label
  const buttons = content.match(/<button(?![^>]*\baria-label\b)(?![^>]*>[^<]+<\/button>)[^>]*>\s*<\//g);
  if (buttons) {
    issues.push(`${rel}: ${buttons.length} empty <button> without aria-label`);
  }
}

// Check for lang attribute in root layout/html
const layoutFiles = ['src/app/layout.tsx', 'src/app/layout.jsx', 'index.html'];
let hasLang = false;
for (const lf of layoutFiles) {
  const full = path.resolve(process.cwd(), lf);
  if (fs.existsSync(full)) {
    const content = fs.readFileSync(full, 'utf8');
    if (/<html[^>]*\blang\b/.test(content)) {
      hasLang = true;
    }
    break;
  }
}
if (!hasLang && files.length > 0) {
  issues.push('Root layout/html: missing lang attribute on <html> element');
}

if (issues.length > 0) {
  process.stdout.write('[accessibility-check] Issues found:\n');
  issues.forEach((i) => process.stdout.write(`  - ${i}\n`));
  process.exit(1);
}

process.exit(0);
