import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const presetsDir = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'kiro-kit-dev', 'sa', 'ai-engineer'];

describe('hook completeness', () => {
  for (const preset of PRESETS) {
    describe(`preset: ${preset}`, () => {
      it('every cross-platform hook with .sh or .ps1 also has .js', () => {
        const hooksDir = path.join(presetsDir, preset, 'hooks');
        if (!fs.existsSync(hooksDir)) {
          expect.fail(`hooks/ directory missing for preset ${preset}`);
          return;
        }

        const files = fs.readdirSync(hooksDir);

        // Collect hook base names from .sh and .ps1 files
        const shellHooks = new Set(
          files
            .filter((f) => f.endsWith('.sh') || f.endsWith('.ps1'))
            .map((f) => f.replace(/\.(sh|ps1)$/, '')),
        );

        // Every hook that has a .sh or .ps1 must also have a .js
        const violations: string[] = [];
        for (const hookName of shellHooks) {
          if (!files.includes(`${hookName}.js`)) {
            violations.push(hookName);
          }
        }

        expect(
          violations,
          `Hooks with .sh/.ps1 but missing .js: ${violations.join(', ')}`,
        ).toHaveLength(0);
      });

      it('has at least one cross-platform hook triple (js + sh/ps1)', () => {
        const hooksDir = path.join(presetsDir, preset, 'hooks');
        if (!fs.existsSync(hooksDir)) return;

        const files = fs.readdirSync(hooksDir);
        const jsHooks = files.filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));

        const crossPlatformHooks = jsHooks.filter(
          (name) => files.includes(`${name}.sh`) || files.includes(`${name}.ps1`),
        );

        expect(crossPlatformHooks.length).toBeGreaterThanOrEqual(1);
      });
    });
  }
});
