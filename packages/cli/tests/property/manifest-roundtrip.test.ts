import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parse, print } from '../../src/core/ManifestParser.js';

const artifactTypes = [
  'steering', 'hook', 'mcp', 'skill', 'agent',
  'command', 'workflow', 'statusline', 'metadata',
  'settings', 'env', 'spec', 'docs', 'other',
] as const;

const presetNames = [
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'kiro-kit-dev', 'sa',
] as const;

const fileEntryArb = fc.record({
  source: fc.stringMatching(/^[a-z][a-z0-9\-\/\.]{1,40}$/),
  target: fc.stringMatching(/^\.kiro\/[a-z][a-z0-9\-\/\.]{1,40}$/),
  type: fc.constantFrom(...artifactTypes),
});

const manifestArb = fc.record({
  name: fc.constantFrom(...presetNames),
  version: fc.tuple(
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
  ).map(([a, b, c]) => `${a}.${b}.${c}`),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  category: fc.constantFrom(...presetNames),
  files: fc.array(fileEntryArb, { minLength: 1, maxLength: 5 }),
});

describe('ManifestParser round-trip property', () => {
  it('parse(print(m)) === m for any valid manifest', () => {
    fc.assert(
      fc.property(manifestArb, (manifest) => {
        const json = print(manifest);
        const result = parse(json);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual(manifest);
        }
      }),
      { numRuns: 100 },
    );
  });
});
