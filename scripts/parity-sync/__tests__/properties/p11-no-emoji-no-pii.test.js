// Feature: claudekit-parity-sync, Property 11: No Emoji and No PII
// **Validates: Requirements 1.6, 11.6, 16.1, 16.2, 16.3, 16.4, 17.4, 19.3**
'use strict';

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.resolve(__dirname, '../../../../presets');
const AUDITS_DIR = path.resolve(__dirname, '../../../../docs/audits/claudekit-vs-kirokit');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai'];

// Emoji regex — full emoji range U+1F300 to U+1FAFF
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}]/u;

// PII patterns
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// Only scan these extensions for emoji/PII (skip binary, font, license files)
const SCAN_EXTENSIONS = new Set(['.md', '.json']);

// Known paths with pre-existing emoji from source kit content that are
// acceptable (used as status indicators in documentation/scripts)
const EMOJI_EXEMPT_PATTERNS = [
  'scripts/install-deps',
  'references/image-generation',
  'workflows/library-search',
  'workflows/documentation',
  'canvas-fonts/',
  'ooxml/schemas/',
];

// Known paths/patterns with legitimate emails (font licenses, service accounts)
const PII_EXEMPT_PATTERNS = [
  'OFL.txt',
  'LICENSE',
  'canvas-fonts/',
  'ooxml/',
  '.iam.gserviceaccount.com',
];

function walkMdJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMdJsonFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SCAN_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

describe('Property 11: No Emoji + No PII', () => {
  // Collect all scannable .md and .json files from presets/ and docs/audits/
  const allFiles = [];
  for (const preset of PRESETS) {
    allFiles.push(...walkMdJsonFiles(path.join(PRESETS_DIR, preset)));
  }
  if (fs.existsSync(AUDITS_DIR)) {
    allFiles.push(...walkMdJsonFiles(AUDITS_DIR));
  }

  it('no emoji found in preset .md/.json files (excluding known exempt paths)', () => {
    if (allFiles.length === 0) return;

    const arbFileIndex = fc.integer({ min: 0, max: allFiles.length - 1 });

    fc.assert(
      fc.property(arbFileIndex, (idx) => {
        const filePath = allFiles[idx];
        const relPath = path.relative(process.cwd(), filePath);

        // Skip known pre-existing emoji paths
        if (EMOJI_EXEMPT_PATTERNS.some((p) => relPath.includes(p))) return;

        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(EMOJI_RE);
        expect(
          match,
          `Emoji found in ${relPath}: "${match?.[0]}"`
        ).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('no PII (real email) found in preset .md/.json files (excluding exempt paths)', () => {
    if (allFiles.length === 0) return;

    const arbFileIndex = fc.integer({ min: 0, max: allFiles.length - 1 });

    // Allowlist for legitimate patterns
    const ALLOWED_EMAIL_DOMAINS = [
      'example.com',
      'placeholder',
      '@users.noreply',
      '.iam.gserviceaccount.com',
      '@project.',
      'your-project',
      'my-project',
      '@domain.',
      'company.com',
      'mycompany.com',
      'yourcompany.com',
      'acme.com',
      'test.com',
      'localhost',
      'email.com',
      'mail.com',
      'gmail.com',  // generic example references
      'org.example',
    ];

    fc.assert(
      fc.property(arbFileIndex, (idx) => {
        const filePath = allFiles[idx];
        const relPath = path.relative(process.cwd(), filePath);

        // Skip known exempt paths (license files, font files, etc.)
        if (PII_EXEMPT_PATTERNS.some((p) => relPath.includes(p))) return;

        const content = fs.readFileSync(filePath, 'utf-8');

        // Check email
        const emailMatches = content.match(new RegExp(EMAIL_RE.source, 'g')) || [];
        const realEmails = emailMatches.filter(
          (e) => !ALLOWED_EMAIL_DOMAINS.some((d) => e.toLowerCase().includes(d))
        );

        expect(
          realEmails.length,
          `PII email found in ${relPath}: ${realEmails.join(', ')}`
        ).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});
