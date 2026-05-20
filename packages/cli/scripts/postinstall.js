#!/usr/bin/env node
// postinstall.js — Plain JS welcome notice after `npm install kiro-kit`.
//
// Rules:
//   - No external dependencies (no figlet, boxen, ora, listr2, prompts, etc.)
//   - Always exits 0 — never fails npm install
//   - Respects KIRO_KIT_SKIP_POSTINSTALL, NO_COLOR, CI, non-TTY
//   - Output <= 600 bytes, <= 12 lines
//   - Reads version from ../package.json
//
// Note: package has "type":"module" so this file runs as ESM.
// We use fs.readFileSync + JSON.parse instead of require() for the version.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

try {
  var env = process.env;

  // Opt-out: silent exit
  if (env.KIRO_KIT_SKIP_POSTINSTALL) {
    process.exit(0);
  }

  var isCI  = Boolean(env.CI);
  var isTTY = Boolean(process.stdout.isTTY);
  var noColor = Boolean(env.NO_COLOR) || !isTTY;

  // Read version from sibling package.json using ESM-compatible path resolution
  var version = '0.0.0';
  try {
    var __filename = fileURLToPath(import.meta.url);
    var __dirname  = dirname(__filename);
    var pkgPath    = join(__dirname, '..', 'package.json');
    var pkg        = JSON.parse(readFileSync(pkgPath, 'utf8'));
    version = pkg.version || version;
  } catch (_e) {
    // version stays at fallback
  }

  // CI or non-TTY: plain text only, no box
  if (isCI || !isTTY) {
    process.stdout.write('kiro-kit ' + version + ' installed.\nNext: npx kiro-kit init\n');
    process.exit(0);
  }

  // Interactive TTY: render a simple inline box using only ANSI codes
  // (no boxen, no chalk — just raw escape sequences)
  var purple = function(s) { return noColor ? s : '\x1B[1;38;2;169;112;255m' + s + '\x1B[0m'; };
  var dim    = function(s) { return noColor ? s : '\x1B[2m' + s + '\x1B[0m'; };
  var bold   = function(s) { return noColor ? s : '\x1B[1m' + s + '\x1B[0m'; };

  // Box drawing: use ASCII when NO_COLOR (safe for all terminals)
  var tl = noColor ? '+' : '\u256D';
  var tr = noColor ? '+' : '\u256E';
  var bl = noColor ? '+' : '\u2570';
  var br = noColor ? '+' : '\u256F';
  var hz = noColor ? '-' : '\u2500';
  var vt = noColor ? '|' : '\u2502';

  var W = 52; // inner content width (between borders)
  var top    = tl + hz.repeat(W) + tr;
  var bottom = bl + hz.repeat(W) + br;

  function row(content) {
    // Pad content to W chars (visible width only — no ANSI in content here)
    var pad = Math.max(0, W - 2 - content.length);
    return vt + ' ' + content + ' '.repeat(pad) + ' ' + vt;
  }

  var lines = [
    '',
    top,
    row(purple('kiro-kit') + ' ' + dim('v' + version) + ' installed'),
    row(''),
    row('Next:    ' + bold('npx kiro-kit init')),
    row('Docs:    https://github.com/ihatesea69/kiro-kit'),
    row('Presets: frontend / backend / fullstack'),
    row('         mobile / devops / data-ai'),
    bottom,
    '',
  ];

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
} catch (_err) {
  // Never fail npm install — swallow all errors silently
  process.exit(0);
}
