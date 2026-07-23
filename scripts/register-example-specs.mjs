#!/usr/bin/env node
// register-example-specs.mjs
//
// For every presets/<preset>/specs/example-<name> folder:
//   1. adds a .config.kiro marker (fresh UUID) if missing, so Kiro's Specs
//      panel recognizes it;
//   2. declares every file in the folder (requirements/design/tasks +
//      .config.kiro) in the preset manifest as type "spec" if not declared.
//
// Idempotent. Usage: node scripts/register-example-specs.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const presetsDir = path.join(repoRoot, 'presets');

let addedConfigs = 0;
let addedDecls = 0;

for (const entry of fs.readdirSync(presetsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const presetDir = path.join(presetsDir, entry.name);
  const specsDir = path.join(presetDir, 'specs');
  if (!fs.existsSync(specsDir)) continue;

  const manifestPath = path.join(presetDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const declared = new Set(manifest.files.map((f) => f.source));

  const exampleDirs = fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('example-'))
    .map((d) => d.name);

  for (const specName of exampleDirs) {
    const specDir = path.join(specsDir, specName);

    // 1. ensure .config.kiro
    const configPath = path.join(specDir, '.config.kiro');
    if (!fs.existsSync(configPath)) {
      const cfg = {
        specId: crypto.randomUUID(),
        workflowType: 'requirements-first',
        specType: 'feature',
      };
      fs.writeFileSync(configPath, JSON.stringify(cfg), 'utf-8');
      addedConfigs++;
    }

    // 2. declare every file in the folder
    for (const file of fs.readdirSync(specDir)) {
      const source = `specs/${specName}/${file}`;
      if (declared.has(source)) continue;
      manifest.files.push({
        source,
        target: `.kiro/${source}`,
        type: 'spec',
      });
      declared.add(source);
      addedDecls++;
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

console.log(`Done. Added ${addedConfigs} .config.kiro marker(s) and ${addedDecls} manifest declaration(s).`);
