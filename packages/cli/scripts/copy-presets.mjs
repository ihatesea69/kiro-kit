// Cross-platform preset copy used by tsup `onSuccess`.
// Copies <repo>/presets to packages/cli/dist/presets so the published
// tarball includes them (presets are bundled, not fetched).

import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(here, '..');
const repoRoot = path.resolve(cliRoot, '..', '..');
const src = path.join(repoRoot, 'presets');
const dest = path.join(cliRoot, 'dist', 'presets');

if (!existsSync(src)) {
  console.warn(`[copy-presets] source not found: ${src} (skipping)`);
  process.exit(0);
}

await mkdir(path.dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-presets] copied ${src} -> ${dest}`);
