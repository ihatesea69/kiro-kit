#!/usr/bin/env node
/**
 * relocate-example-specs.mjs
 *
 * Makes the worked example specs visible in Kiro's Specs panel. Kiro discovers
 * specs as direct children of `.kiro/specs/<name>/` that carry a `.config.kiro`
 * marker. Our examples were nested under `specs/examples/<feature>/` and lacked
 * the marker, so Kiro never showed them.
 *
 * This script, per preset:
 *   1. moves `specs/examples/<feature>/`  ->  `specs/example-<feature>/`
 *   2. adds a `.config.kiro` marker to each example spec
 *   3. rewrites the manifest file entries (`specs/examples/` -> `specs/example-`)
 *      and declares the new `.config.kiro` file
 *
 * Idempotent-ish: safe to run once. Usage: node scripts/relocate-example-specs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const presetsDir = path.join(repoRoot, 'presets');

let moved = 0;
for (const entry of fs.readdirSync(presetsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const presetDir = path.join(presetsDir, entry.name);
  const examplesDir = path.join(presetDir, 'specs', 'examples');
  if (!fs.existsSync(examplesDir)) continue;

  const features = fs
    .readdirSync(examplesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const feature of features) {
    const from = path.join(examplesDir, feature);
    const to = path.join(presetDir, 'specs', `example-${feature}`);

    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) {
      fs.renameSync(path.join(from, f), path.join(to, f));
    }
    fs.rmdirSync(from);

    // Kiro spec marker so it appears in the Specs panel.
    const config = {
      specId: crypto.randomUUID(),
      workflowType: 'requirements-first',
      specType: 'feature',
    };
    fs.writeFileSync(path.join(to, '.config.kiro'), JSON.stringify(config), 'utf-8');

    // Update the preset manifest.
    const manifestPath = path.join(presetDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const oldPrefix = `specs/examples/${feature}/`;
    const newPrefix = `specs/example-${feature}/`;
    for (const fe of manifest.files) {
      if (fe.source.startsWith(oldPrefix)) {
        fe.source = fe.source.replace(oldPrefix, newPrefix);
        fe.target = fe.target.replace(`specs/examples/${feature}/`, `specs/example-${feature}/`);
      }
    }
    // Declare the new .config.kiro if not already present.
    const cfgSource = `${newPrefix}.config.kiro`;
    if (!manifest.files.some((f) => f.source === cfgSource)) {
      manifest.files.push({
        source: cfgSource,
        target: `.kiro/${cfgSource}`,
        type: 'spec',
      });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

    console.log(`[${entry.name}] examples/${feature} -> example-${feature} (+ .config.kiro)`);
    moved++;
  }

  // Remove the now-empty examples/ dir.
  if (fs.existsSync(examplesDir) && fs.readdirSync(examplesDir).length === 0) {
    fs.rmdirSync(examplesDir);
  }
}
console.log(`\nDone. Relocated ${moved} example spec(s).`);
