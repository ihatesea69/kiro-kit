#!/usr/bin/env node
/**
 * sync-preset-manifests.mjs
 *
 * Reconciles each preset's `manifest.json` `files[]` with the files actually on
 * disk, so the strict no-orphan invariant holds after adding native hooks,
 * example specs, and steering docs. For every file present in the preset that is
 * not already declared (and not intentionally ignored), it appends a declaration
 * with an inferred artifact `type` and the conventional `.kiro/<source>` target.
 *
 * Existing declarations are left untouched; new entries are appended sorted by
 * source to keep diffs stable. Re-runnable and idempotent.
 *
 * Usage: node scripts/sync-preset-manifests.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const presetsDir = path.join(repoRoot, 'presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'kiro-kit-dev', 'sa'];

// Files that the no-orphan check ignores (never declared).
const IGNORED = new Set(['manifest.json', 'README.md']);

/** Infer the manifest artifact `type` from a source-relative path. */
function inferType(source) {
  const top = source.split('/')[0];
  if (top === 'hooks') return 'hook';
  if (top === 'specs') return 'spec';
  if (top === 'steering') return 'steering';
  if (top === 'agents') return 'agent';
  if (top === 'commands') return 'command';
  if (top === 'skills') return 'skill';
  if (top === 'workflows') return 'workflow';
  if (top === 'docs') return 'docs';
  if (source.endsWith('.mcp.json.example')) return 'mcp';
  if (source === 'settings.json') return 'settings';
  if (source.startsWith('statusline')) return 'statusline';
  if (source.endsWith('.env.example')) return 'env';
  return 'other';
}

/** Recursively list files under a directory, returned as posix-relative paths. */
function listFiles(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(root, '');
  return out;
}

let totalAdded = 0;
for (const preset of PRESETS) {
  const presetDir = path.join(presetsDir, preset);
  const manifestPath = path.join(presetDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn(`[${preset}] no manifest.json — skipping`);
    continue;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const declared = new Set(manifest.files.map((f) => f.source));

  const onDisk = listFiles(presetDir).filter((f) => !IGNORED.has(f));
  const missing = onDisk.filter((f) => !declared.has(f));

  if (missing.length === 0) {
    console.log(`[${preset}] already in sync (${manifest.files.length} files)`);
    continue;
  }

  const newEntries = missing
    .sort()
    .map((source) => ({ source, target: `.kiro/${source}`, type: inferType(source) }));

  manifest.files.push(...newEntries);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  totalAdded += newEntries.length;
  console.log(`[${preset}] +${newEntries.length} declarations:`);
  for (const e of newEntries) console.log(`    ${e.type.padEnd(9)} ${e.source}`);
}

console.log(`\nDone. Added ${totalAdded} manifest declarations.`);
