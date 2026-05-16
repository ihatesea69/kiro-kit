#!/usr/bin/env node
/**
 * CI lint script: Scan for unicode emoji and PII patterns in source files.
 *
 * Validates: Requirements 1.6, 21.3, 23.7, 44.1, 44.2, 44.4, 44.5
 *
 * Usage: npx tsx packages/cli/scripts/lint-emoji-pii.ts
 * Exit 0 if clean, exit 1 if violations found.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname ?? __dirname, '../../..');

// Unicode emoji ranges
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;

// PII patterns
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;

// File extensions to scan
const SCAN_EXTENSIONS = new Set(['.md', '.json', '.js', '.ts']);

// Directories to skip
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.kiro']);

// Files/patterns to exclude from PII check (legitimate examples)
const PII_EXCLUDE_PATTERNS = [
  /\.env\.example$/,
  /CONTRIBUTING\.md$/,
  /SECURITY\.md$/,
];

interface Violation {
  file: string;
  line: number;
  type: 'emoji' | 'email' | 'phone';
  match: string;
}

function shouldScanFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  return SCAN_EXTENSIONS.has(ext);
}

function shouldCheckPII(filePath: string): boolean {
  // Only check template/example files for PII
  const rel = path.relative(ROOT, filePath);
  return rel.includes('presets/') || rel.includes('templates/');
}

function isPIIExcluded(filePath: string): boolean {
  return PII_EXCLUDE_PATTERNS.some((p) => p.test(filePath));
}

function walkDir(dir: string, files: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkDir(fullPath, files);
    } else if (entry.isFile() && shouldScanFile(fullPath)) {
      files.push(fullPath);
    }
  }
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  let content: string;

  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return violations;
  }

  const lines = content.split('\n');
  const relPath = path.relative(ROOT, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for emoji
    const emojiMatches = line.matchAll(EMOJI_REGEX);
    for (const match of emojiMatches) {
      violations.push({ file: relPath, line: lineNum, type: 'emoji', match: match[0] });
    }

    // Check for PII in template/example files
    if (shouldCheckPII(filePath) && !isPIIExcluded(filePath)) {
      const emailMatches = line.matchAll(EMAIL_REGEX);
      for (const match of emailMatches) {
        // Skip obvious placeholders
        if (match[0].includes('example.com') || match[0].includes('your-')) continue;
        if (match[0].includes('placeholder') || match[0].includes('@domain')) continue;
        violations.push({ file: relPath, line: lineNum, type: 'email', match: match[0] });
      }

      const phoneMatches = line.matchAll(PHONE_REGEX);
      for (const match of phoneMatches) {
        // Skip version numbers and common non-phone patterns
        if (/^\d+\.\d+\.\d+$/.test(match[0])) continue;
        if (match[0].length < 7) continue;
        violations.push({ file: relPath, line: lineNum, type: 'phone', match: match[0] });
      }
    }
  }

  return violations;
}

function main(): void {
  const files: string[] = [];
  walkDir(ROOT, files);

  const allViolations: Violation[] = [];

  for (const file of files) {
    const violations = scanFile(file);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log('No emoji or PII violations found.');
    process.exit(0);
  }

  console.error(`Found ${allViolations.length} violation(s):\n`);
  for (const v of allViolations) {
    console.error(`${v.file}:${v.line} [${v.type}] ${v.match}`);
  }

  process.exit(1);
}

main();
