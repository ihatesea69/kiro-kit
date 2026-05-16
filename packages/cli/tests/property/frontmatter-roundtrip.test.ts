import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parse, print } from '../../src/core/FrontMatterParser.js';

const safeStringArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 \-_.]{0,50}$/);

const frontMatterArb = fc.record({
  name: safeStringArb,
  description: safeStringArb,
  inclusion: fc.constantFrom('always', 'manual', 'fileMatch'),
});

const bodyArb = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9 .,!?#\-*]{0,80}$/),
  { minLength: 1, maxLength: 10 },
).map((lines) => lines.join('\n'));

describe('FrontMatterParser round-trip property', () => {
  it('parse(print(fm, body)) preserves front-matter keys and body', () => {
    fc.assert(
      fc.property(frontMatterArb, bodyArb, (fm, body) => {
        const serialized = print(fm, body);
        const result = parse(serialized);

        // Front-matter keys preserved
        expect(result.frontMatter['name']).toBe(fm.name);
        expect(result.frontMatter['description']).toBe(fm.description);
        expect(result.frontMatter['inclusion']).toBe(fm.inclusion);

        // Body preserved
        expect(result.body).toBe(body);
      }),
      { numRuns: 100 },
    );
  });

  it('content without front-matter returns empty fm and full body', () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        // Ensure body doesn't start with ---
        const safeBody = body.startsWith('---') ? `x${body}` : body;
        const result = parse(safeBody);
        expect(result.frontMatter).toEqual({});
        expect(result.body).toBe(safeBody);
      }),
      { numRuns: 50 },
    );
  });
});
