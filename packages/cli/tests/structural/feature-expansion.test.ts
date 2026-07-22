import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const presetsDir = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai'];

const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md'];

function listNativeHooks(hooksDir: string): string[] {
  if (!fs.existsSync(hooksDir)) return [];
  return fs.readdirSync(hooksDir).filter((f) => f.endsWith('.kiro.hook'));
}

describe('feature expansion — native hooks', () => {
  for (const preset of PRESETS) {
    describe(`preset: ${preset}`, () => {
      const hooksDir = path.join(presetsDir, preset, 'hooks');

      it('ships >= 7 native .kiro.hook files', () => {
        expect(listNativeHooks(hooksDir).length).toBeGreaterThanOrEqual(7);
      });

      it('every native hook is valid JSON with required fields', () => {
        const invalid: string[] = [];
        for (const file of listNativeHooks(hooksDir)) {
          try {
            const parsed = JSON.parse(
              fs.readFileSync(path.join(hooksDir, file), 'utf-8'),
            );
            const ok =
              typeof parsed.name === 'string' &&
              typeof parsed.description === 'string' &&
              typeof parsed.version === 'string' &&
              typeof parsed.enabled === 'boolean' &&
              typeof parsed.when?.type === 'string' &&
              typeof parsed.then?.type === 'string' &&
              (parsed.then.type !== 'askAgent' ||
                typeof parsed.then.prompt === 'string');
            if (!ok) invalid.push(file);
          } catch {
            invalid.push(file);
          }
        }
        expect(invalid, `Invalid native hooks: ${invalid.join(', ')}`).toHaveLength(0);
      });

      it('askAgent hooks default to disabled (opt-in)', () => {
        const enabledAskAgent: string[] = [];
        for (const file of listNativeHooks(hooksDir)) {
          const parsed = JSON.parse(
            fs.readFileSync(path.join(hooksDir, file), 'utf-8'),
          );
          if (parsed.then?.type === 'askAgent' && parsed.enabled === true) {
            enabledAskAgent.push(file);
          }
        }
        expect(
          enabledAskAgent,
          `askAgent hooks must ship disabled: ${enabledAskAgent.join(', ')}`,
        ).toHaveLength(0);
      });
    });
  }
});

describe('feature expansion — example specs', () => {
  for (const preset of PRESETS) {
    it(`preset ${preset} ships at least one complete example spec (with .config.kiro)`, () => {
      const specsDir = path.join(presetsDir, preset, 'specs');
      expect(fs.existsSync(specsDir), `${preset} missing specs/`).toBe(true);

      // Example specs are direct children named `example-*` so Kiro's Specs
      // panel discovers them; each carries a .config.kiro marker.
      const specDirs = fs
        .readdirSync(specsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('example-'))
        .map((e) => e.name);

      expect(specDirs.length).toBeGreaterThanOrEqual(1);

      for (const specName of specDirs) {
        const specDir = path.join(specsDir, specName);
        for (const file of [...REQUIRED_SPEC_FILES, '.config.kiro']) {
          expect(
            fs.existsSync(path.join(specDir, file)),
            `${preset}/${specName} missing ${file}`,
          ).toBe(true);
        }
      }
    });
  }
});

describe('feature expansion — spec-authoring steering', () => {
  for (const preset of PRESETS) {
    it(`preset ${preset} ships spec-driven-development steering`, () => {
      const steering = path.join(
        presetsDir,
        preset,
        'steering',
        'spec-driven-development.md',
      );
      expect(fs.existsSync(steering)).toBe(true);
    });
  }
});
