import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  onSuccess: 'cp -r ../../presets dist/presets 2>/dev/null || xcopy /E /I /Y ..\\..\\presets dist\\presets >nul 2>&1 || true',
});
