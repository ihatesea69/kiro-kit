#!/usr/bin/env node
/**
 * fix-manifest-mcp.mjs
 *
 * Fixes the `mcpServers` block inside each preset's `manifest.json` — this block
 * is written to `.kiro/settings/mcp.json` on `init`, so it must not reference the
 * unclaimed `@mcp/docs-seeker` scope (dependency-confusion RCE) or other
 * non-existent packages. Mirrors scripts/fix-mcp-examples.mjs.
 *
 *  - Remove `docs-seeker` (@mcp/docs-seeker), `docker`, `jupyter`.
 *  - git/fetch -> official Python servers via uvx.
 *  - playwright -> @playwright/mcp (real package).
 *
 * Idempotent. Usage: node scripts/fix-manifest-mcp.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const presetsDir = path.join(repoRoot, 'presets');

const REMOVE = new Set(['docs-seeker', 'docker', 'jupyter']);

let changed = 0;
for (const entry of fs.readdirSync(presetsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = path.join(presetsDir, entry.name, 'manifest.json');
  if (!fs.existsSync(manifestPath)) continue;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const servers = manifest.mcpServers;
  if (!servers || typeof servers !== 'object') continue;

  const removed = [];
  for (const name of Object.keys(servers)) {
    if (REMOVE.has(name)) {
      delete servers[name];
      removed.push(name);
    } else if (name === 'git') {
      servers[name] = { command: 'uvx', args: ['mcp-server-git', '--repository', '.'] };
    } else if (name === 'fetch') {
      servers[name] = { command: 'uvx', args: ['mcp-server-fetch'] };
    } else if (name === 'playwright') {
      servers[name] = { command: 'npx', args: ['-y', '@playwright/mcp'] };
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  changed++;
  console.log(`[${entry.name}] removed: ${removed.join(', ') || '(none)'}; normalized git/fetch/playwright`);
}
console.log(`\nDone. Fixed mcpServers in ${changed} manifest(s).`);
