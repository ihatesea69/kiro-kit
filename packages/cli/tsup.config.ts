import { defineConfig } from 'tsup';

// ESM-only packages that must be bundled (cannot be required at runtime)
const ESM_ONLY_PACKAGES = [
  'chalk',
  'figlet',
  'gradient-string',
  'boxen',
  'ora',
  'listr2',
  'prompts',
  'terminal-link',
  'strip-ansi',
];

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  // Bundle ESM-only packages so the dist output works with Node CJS consumers
  noExternal: ESM_ONLY_PACKAGES,
  onSuccess: 'node ./scripts/copy-presets.mjs',
});
