import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const presetsDir = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'kiro-kit-dev', 'sa', 'ai-engineer'];

const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md'];

/**
 * Native hooks use the v1 schema (Kiro IDE 1.0 / CLI 3.0): `.kiro/hooks/*.json`
 * holding `{version:"v1", hooks:[...]}` with PascalCase triggers. The retired 0.x
 * `.kiro.hook` format must not reappear — see `scripts/generate-native-hooks.mjs`.
 */
const V1_TRIGGERS = new Set([
  'PostFileSave',
  'PostFileCreate',
  'PostFileDelete',
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'SessionStart',
  'Stop',
  'PreTaskExec',
  'PostTaskExec',
]);

function listNativeHooks(hooksDir: string): string[] {
  if (!fs.existsSync(hooksDir)) return [];
  return fs.readdirSync(hooksDir).filter((f) => f.endsWith('.json'));
}

function readHookEntries(hooksDir: string, file: string): Record<string, any>[] {
  const parsed = JSON.parse(fs.readFileSync(path.join(hooksDir, file), 'utf-8'));
  if (parsed.version !== 'v1' || !Array.isArray(parsed.hooks)) {
    throw new Error(`${file} is not a v1 hook file`);
  }
  return parsed.hooks;
}

describe('feature expansion — native hooks', () => {
  for (const preset of PRESETS) {
    describe(`preset: ${preset}`, () => {
      const hooksDir = path.join(presetsDir, preset, 'hooks');

      it('ships >= 6 native v1 hook files', () => {
        expect(listNativeHooks(hooksDir).length).toBeGreaterThanOrEqual(6);
      });

      it('ships no retired 0.x .kiro.hook files', () => {
        const legacy = fs.existsSync(hooksDir)
          ? fs.readdirSync(hooksDir).filter((f) => f.endsWith('.kiro.hook'))
          : [];
        expect(legacy, `Retired 0.x hooks: ${legacy.join(', ')}`).toHaveLength(0);
      });

      it('every native hook is a valid v1 file with required fields', () => {
        const invalid: string[] = [];
        for (const file of listNativeHooks(hooksDir)) {
          try {
            for (const h of readHookEntries(hooksDir, file)) {
              const actionOk =
                h.action?.type === 'agent'
                  ? typeof h.action.prompt === 'string'
                  : h.action?.type === 'command'
                    ? typeof h.action.command === 'string'
                    : false;
              const ok =
                typeof h.name === 'string' &&
                typeof h.description === 'string' &&
                typeof h.enabled === 'boolean' &&
                V1_TRIGGERS.has(h.trigger) &&
                actionOk;
              if (!ok) invalid.push(file);
            }
          } catch {
            invalid.push(file);
          }
        }
        expect(invalid, `Invalid native hooks: ${invalid.join(', ')}`).toHaveLength(0);
      });

      it('matcher is a valid regex when present', () => {
        const bad: string[] = [];
        for (const file of listNativeHooks(hooksDir)) {
          for (const h of readHookEntries(hooksDir, file)) {
            if (h.matcher === undefined) continue;
            if (typeof h.matcher !== 'string') {
              bad.push(`${file} (not a string)`);
              continue;
            }
            try {
              new RegExp(h.matcher);
            } catch {
              bad.push(`${file} (${h.matcher})`);
            }
          }
        }
        expect(bad, `Invalid matchers: ${bad.join(', ')}`).toHaveLength(0);
      });

      it('agent hooks default to disabled (opt-in)', () => {
        const enabledAgent: string[] = [];
        for (const file of listNativeHooks(hooksDir)) {
          for (const h of readHookEntries(hooksDir, file)) {
            if (h.action?.type === 'agent' && h.enabled === true) {
              enabledAgent.push(file);
            }
          }
        }
        expect(
          enabledAgent,
          `agent hooks must ship disabled: ${enabledAgent.join(', ')}`,
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
