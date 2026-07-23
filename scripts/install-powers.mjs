#!/usr/bin/env node
/**
 * install-powers.mjs
 *
 * Installs Kiro Powers programmatically by replicating what the Kiro IDE does:
 *   1. shallow-clone the power's git repo into ~/.kiro/powers/repos/<name>/
 *   2. copy the power folder (pathInRepo) into ~/.kiro/powers/installed/<name>/
 *   3. register it in ~/.kiro/powers/installed.json
 *
 * IMPORTANT
 *   - CLOSE Kiro before running (a running IDE may overwrite installed.json).
 *   - installed.json is backed up first; this is fully reversible (remove the
 *     entry + the installed/<name> and repos/<name> folders).
 *   - Powers that rely on an MCP server won't provide tools while your Kiro org
 *     has MCP disabled — but their POWER.md steering still applies.
 *
 * Usage:
 *   node scripts/install-powers.mjs            # install the default set
 *   node scripts/install-powers.mjs neon postman stripe   # install specific
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const POWERS_DIR = path.join(os.homedir(), '.kiro', 'powers');
const INSTALLED_DIR = path.join(POWERS_DIR, 'installed');
const REPOS_DIR = path.join(POWERS_DIR, 'repos');
const INSTALLED_JSON = path.join(POWERS_DIR, 'installed.json');

// Catalog: power name -> where to fetch it. Extend freely.
// pathInRepo is the sub-folder in the repo that contains POWER.md + mcp.json.
const CATALOG = {
  neon:     { cloneUrl: 'https://github.com/kirodotdev/powers', pathInRepo: 'neon',     registryId: 'kiro-recommended' },
  postman:  { cloneUrl: 'https://github.com/kirodotdev/powers', pathInRepo: 'postman',  registryId: 'kiro-recommended' },
  stripe:   { cloneUrl: 'https://github.com/kirodotdev/powers', pathInRepo: 'stripe',   registryId: 'kiro-recommended' },
  datadog:  { cloneUrl: 'https://github.com/kirodotdev/powers', pathInRepo: 'datadog',  registryId: 'kiro-recommended' },
  checkout: { cloneUrl: 'https://github.com/kirodotdev/powers', pathInRepo: 'checkout', registryId: 'kiro-recommended' },
};

const DEFAULT_SET = ['neon', 'postman'];

function readInstalled() {
  try {
    return JSON.parse(fs.readFileSync(INSTALLED_JSON, 'utf-8'));
  } catch {
    return { version: '1.0.0', installedPowers: [], dismissedAutoInstalls: [] };
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  if (!fs.existsSync(POWERS_DIR)) {
    console.error(`Kiro powers dir not found: ${POWERS_DIR}\nIs Kiro installed for this user?`);
    process.exit(1);
  }

  const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const names = requested.length ? requested : DEFAULT_SET;

  const data = readInstalled();
  const already = new Set(data.installedPowers.map((p) => p.name));

  // Back up installed.json (timestamp from mtime-free counter to stay simple).
  const backup = `${INSTALLED_JSON}.bak`;
  fs.copyFileSync(INSTALLED_JSON, backup);
  console.log(`Backed up installed.json -> ${backup}\n`);

  let installed = 0;
  for (const name of names) {
    const spec = CATALOG[name];
    if (!spec) { console.warn(`! "${name}" not in catalog — skipping`); continue; }
    if (already.has(name)) { console.log(`= ${name} already installed — skipping`); continue; }

    const repoDir = path.join(REPOS_DIR, name);
    const activeDir = path.join(INSTALLED_DIR, name);

    // 1. shallow clone
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.mkdirSync(REPOS_DIR, { recursive: true });
    console.log(`↓ cloning ${name} from ${spec.cloneUrl} ...`);
    execSync(`git clone --depth 1 "${spec.cloneUrl}" "${repoDir}"`, { stdio: 'pipe' });

    // 2. copy the power folder into installed/
    const srcPower = spec.pathInRepo ? path.join(repoDir, spec.pathInRepo) : repoDir;
    if (!fs.existsSync(path.join(srcPower, 'POWER.md'))) {
      console.warn(`! ${name}: POWER.md not found at ${spec.pathInRepo} — skipping`);
      fs.rmSync(repoDir, { recursive: true, force: true });
      continue;
    }
    fs.rmSync(activeDir, { recursive: true, force: true });
    copyDir(srcPower, activeDir);

    // 3. register
    data.installedPowers.push({ name, registryId: spec.registryId });
    installed++;
    console.log(`✔ installed ${name}`);
  }

  fs.writeFileSync(INSTALLED_JSON, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`\nDone. Installed ${installed} power(s). Restart Kiro to see them.`);
  console.log(`(To undo: restore ${path.basename(backup)} and delete the installed/<name> + repos/<name> folders.)`);
}

main();
