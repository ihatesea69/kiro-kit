// Feature: claudekit-parity-sync, Property 9: Tri-script Completeness
// **Validates: Requirements 7.2, 7.4, 9.1, 19.4**
'use strict';

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai'];

describe('Property 9: Tri-script Completeness', () => {
  it('for every .sh/.ps1 in hooks/, a corresponding .js exists', () => {
    const arbPreset = fc.constantFrom(...PRESETS);

    fc.assert(
      fc.property(arbPreset, (preset) => {
        const hooksDir = path.join(PRESETS_DIR, preset, 'hooks');
        if (!fs.existsSync(hooksDir)) return; // vacuously true

        const files = fs.readdirSync(hooksDir);

        // Collect base names from .sh and .ps1 files
        const shellHooks = new Set(
          files
            .filter((f) => f.endsWith('.sh') || f.endsWith('.ps1'))
            .map((f) => f.replace(/\.(sh|ps1)$/, ''))
        );

        // Every hook that has a .sh or .ps1 must also have a .js
        for (const hookName of shellHooks) {
          expect(
            files.includes(`${hookName}.js`),
            `preset=${preset}: ${hookName}.sh/.ps1 exists but ${hookName}.js is missing`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('for every .sh/.ps1 statusline at preset root, a corresponding .js exists', () => {
    const arbPreset = fc.constantFrom(...PRESETS);

    fc.assert(
      fc.property(arbPreset, (preset) => {
        const presetDir = path.join(PRESETS_DIR, preset);
        if (!fs.existsSync(presetDir)) return;

        const files = fs.readdirSync(presetDir);

        // Check statusline tri-script at root
        const statuslineShell = files.filter(
          (f) => f.startsWith('statusline.') && (f.endsWith('.sh') || f.endsWith('.ps1'))
        );

        for (const shellFile of statuslineShell) {
          const baseName = shellFile.replace(/\.(sh|ps1)$/, '');
          expect(
            files.includes(`${baseName}.js`),
            `preset=${preset}: ${shellFile} exists but ${baseName}.js is missing`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
