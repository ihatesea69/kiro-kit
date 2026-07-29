// Regression: documents whose entire content is a name inherited from
// Object.prototype used to break parsing.
//
// `gray-matter`'s `matter(str)` memoises into a plain object keyed by the raw
// string. For "toString", "constructor", "__proto__" and friends the lookup
// hit Object.prototype, gray-matter treated the inherited function as a cached
// result, and handed back an object whose `.content` was undefined. Callers
// then crashed on the next string operation with
// "Cannot read properties of undefined (reading 'replace')".
//
// Found by the p04 property test, which failed on roughly 1 CI job in 9 —
// often enough to block a merge, rarely enough to look like flake.
'use strict';

const { parse, serialize } = require('../../lib/yaml-front-matter');
const { rebrand, CLAUDE_CODE_SKILL_MARKER } = require('../../rebrander');

const PROTO_KEYS = [
  'toString',
  'constructor',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__proto__',
  '__defineGetter__',
];

describe('yaml-front-matter — Object.prototype key collisions', () => {
  for (const key of PROTO_KEYS) {
    it(`parse() returns a string body for content "${key}"`, () => {
      const result = parse(key);
      expect(typeof result.body).toBe('string');
      expect(result.body).toBe(key);
      expect(result.hasFrontMatter).toBe(false);
    });
  }

  it('round-trips a prototype-named document unchanged', () => {
    const parsed = parse('toString');
    expect(serialize(parsed.data, parsed.body)).toBe('toString');
  });

  it('still parses those names inside a normal document', () => {
    const doc = '---\ntitle: x\n---\ntoString and constructor\n';
    const parsed = parse(doc);
    expect(parsed.data.title).toBe('x');
    expect(parsed.body).toContain('toString and constructor');
  });
});

describe('rebrander — Object.prototype key collisions', () => {
  for (const key of PROTO_KEYS) {
    it(`rebrand() returns a string for content "${key}"`, () => {
      const out = rebrand(key, {
        targetPath: `presets/frontend/${CLAUDE_CODE_SKILL_MARKER}x.md`,
      });
      expect(typeof out).toBe('string');
      expect(out).toBe(key);
    });
  }

  it('rebrands normally when a prototype name sits next to a target pattern', () => {
    const out = rebrand('toString ClaudeKit', { targetPath: 'presets/frontend/a/b.md' });
    expect(out).toBe('toString KiroKit');
  });
});
