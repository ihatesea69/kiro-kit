import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse, print, validate } from '../../src/core/ManifestParser.js';

function makeValidManifest() {
  return {
    name: 'frontend',
    version: '1.0.0',
    description: 'Frontend preset',
    category: 'frontend',
    files: [
      { source: 'agents/code-reviewer.md', target: '.kiro/agents/code-reviewer.md', type: 'agent' },
    ],
  };
}

describe('ManifestParser', () => {
  describe('parse', () => {
    it('parses a valid manifest', () => {
      const json = JSON.stringify(makeValidManifest());
      const result = parse(json);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('frontend');
        expect(result.value.version).toBe('1.0.0');
        expect(result.value.files).toHaveLength(1);
      }
    });

    it('returns error for invalid JSON', () => {
      const result = parse('{ not valid json !!!');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('KK010');
        expect(result.error.message).toContain('not valid JSON');
      }
    });

    it('returns error for missing required field', () => {
      const incomplete = { name: 'frontend', version: '1.0.0' };
      const result = parse(JSON.stringify(incomplete));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('KK011');
      }
    });

    it('returns error for wrong type', () => {
      const bad = { ...makeValidManifest(), version: 123 };
      const result = parse(JSON.stringify(bad));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('KK011');
      }
    });
  });

  describe('print', () => {
    it('pretty-prints manifest as JSON', () => {
      const m = makeValidManifest() as any;
      const output = print(m);
      expect(JSON.parse(output)).toEqual(m);
      expect(output).toContain('\n'); // indented
    });
  });

  describe('validate', () => {
    let tmpDir: string;

    function setup() {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-manifest-'));
    }

    function cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    it('detects file completeness failure (missing file on disk)', () => {
      setup();
      try {
        const m = makeValidManifest() as any;
        // Don't create the file on disk
        const result = validate(m, tmpDir);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.some((e) => e.code === 'KK013')).toBe(true);
        }
      } finally {
        cleanup();
      }
    });

    it('detects orphan files not declared in manifest', () => {
      setup();
      try {
        const m = makeValidManifest() as any;
        // Create the declared file
        const agentsDir = path.join(tmpDir, 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, 'code-reviewer.md'), 'content');
        // Create an orphan file
        fs.writeFileSync(path.join(tmpDir, 'orphan.txt'), 'orphan');

        const result = validate(m, tmpDir);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.some((e) => e.code === 'KK012')).toBe(true);
          expect(result.error.some((e) => e.message.includes('orphan.txt'))).toBe(true);
        }
      } finally {
        cleanup();
      }
    });
  });
});
