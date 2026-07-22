#!/usr/bin/env node
/**
 * prune-manifest-broken-links.mjs
 *
 * Removes manifest `files[]` entries whose `source` does not exist on disk.
 * These are stale declarations for gitignored build artifacts (e.g.
 * `skills/mcp-management/scripts/dist/*.js`) and rejected files
 * (`test_failures.log`) that are never built during packaging, so they ship as
 * broken references (the CLI silently skips them and the structural
 * no-broken-link test fails). Pruning makes the manifest honest.
 *
 * Usage: node scripts/prune-manifest-broken-links.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const presetsDir = path.join(repoRoot, 'presets');

let totalPruned = 0;
for (const entry of fs.readdirSync(presetsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const presetDir = path.join(presetsDir, entry.name);
  const manifestPath = path.join(presetDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) continue;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const before = manifest.files.length;
  const removed = [];

  manifest.files = manifest.files.filter((f) => {
    const exists = fs.existsSync(path.join(presetDir, f.source));
    if (!exists) removed.push(f.source);
    return exists;
  });

  if (removed.length > 0) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    totalPruned += removed.length;
    console.log(`[${entry.name}] pruned ${removed.length} broken entr(ies):`);
    for (const r of removed) console.log(`    ${r}`);
  } else {
    console.log(`[${entry.name}] no broken links (${before} files)`);
  }
}
console.log(`\nDone. Pruned ${totalPruned} broken manifest entries.`);
