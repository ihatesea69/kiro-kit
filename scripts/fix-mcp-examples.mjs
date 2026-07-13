#!/usr/bin/env node
/**
 * fix-mcp-examples.mjs
 *
 * Corrects MCP server references in all shipped `.mcp.json.example` files:
 *  - Removes `docs-seeker` (`@mcp/docs-seeker` — the `@mcp` npm scope is
 *    UNCLAIMED, a dependency-confusion RCE risk via `npx -y`).
 *  - Removes `docker` and `jupyter` (no official npm package exists — 404).
 *  - Fixes `git`/`fetch` to the official Python servers via `uvx`.
 *  - Fixes `playwright` from the non-existent `@playwright/mcp-server`
 *    to the real `@playwright/mcp`.
 *
 * Idempotent. Usage: node scripts/fix-mcp-examples.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const targets = [
  '.kiro/.mcp.json.example',
  ...['backend', 'frontend', 'fullstack', 'mobile', 'devops', 'data-ai', '_template'].map(
    (p) => `presets/${p}/.mcp.json.example`,
  ),
];

const REMOVE = new Set(['docs-seeker', 'docker', 'jupyter']);

let changed = 0;
for (const rel of targets) {
  const file = path.join(repoRoot, rel);
  if (!fs.existsSync(file)) continue;

  const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const servers = cfg.mcpServers ?? {};
  const removed = [];

  for (const name of Object.keys(servers)) {
    if (REMOVE.has(name)) {
      delete servers[name];
      removed.push(name);
      continue;
    }
    if (name === 'git') {
      servers[name] = {
        command: 'uvx',
        args: ['mcp-server-git', '--repository', '${WORKSPACE_ROOT}'],
      };
    } else if (name === 'fetch') {
      servers[name] = { command: 'uvx', args: ['mcp-server-fetch'] };
    } else if (name === 'playwright') {
      const env = servers[name].env;
      servers[name] = {
        command: 'npx',
        args: ['-y', '@playwright/mcp'],
        ...(env ? { env } : {}),
      };
    }
  }

  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
  changed++;
  console.log(`[${rel}] removed: ${removed.join(', ') || '(none)'}; normalized git/fetch/playwright`);
}
console.log(`\nDone. Rewrote ${changed} .mcp.json.example files.`);
