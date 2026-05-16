import { describe, it, expect } from 'vitest';
import { parse, print, validateByType } from '../../src/core/FrontMatterParser.js';
import { KKError } from '../../src/core/errors.js';

describe('FrontMatterParser', () => {
  describe('parse', () => {
    it('parses valid YAML front-matter', () => {
      const content = `---
name: my-agent
description: A test agent
model: sonnet
---
Body content here`;

      const result = parse(content);
      expect(result.frontMatter['name']).toBe('my-agent');
      expect(result.frontMatter['description']).toBe('A test agent');
      expect(result.frontMatter['model']).toBe('sonnet');
      expect(result.body).toBe('Body content here');
    });

    it('throws KKError for malformed YAML', () => {
      const content = `---
name: [invalid yaml
  broken: {{{
---
Body`;

      expect(() => parse(content)).toThrow(KKError);
      try {
        parse(content);
      } catch (e) {
        expect((e as KKError).code).toBe('KK080');
      }
    });

    it('returns empty front-matter when no delimiters', () => {
      const content = 'Just body content without front-matter';
      const result = parse(content);
      expect(result.frontMatter).toEqual({});
      expect(result.body).toBe(content);
    });
  });

  describe('validateByType', () => {
    it('validates agent requires name and description', () => {
      const errors = validateByType({}, 'agent');
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.field === 'name')).toBe(true);
      expect(errors.some((e) => e.field === 'description')).toBe(true);
    });

    it('validates command requires description', () => {
      const errors = validateByType({}, 'command');
      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('description');
    });

    it('validates skill requires name and description', () => {
      const errors = validateByType({}, 'skill');
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.field === 'name')).toBe(true);
      expect(errors.some((e) => e.field === 'description')).toBe(true);
    });

    it('validates steering requires inclusion and description', () => {
      const errors = validateByType({}, 'steering');
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.field === 'inclusion')).toBe(true);
      expect(errors.some((e) => e.field === 'description')).toBe(true);
    });

    it('validates steering with fileMatch requires fileMatchPattern', () => {
      const errors = validateByType(
        { inclusion: 'fileMatch', description: 'test' },
        'steering',
      );
      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('fileMatchPattern');
    });

    it('passes valid agent front-matter', () => {
      const errors = validateByType(
        { name: 'my-agent', description: 'Does things' },
        'agent',
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('round-trip', () => {
    it('parse then print preserves content', () => {
      const original = `---
name: test-agent
description: A round-trip test
model: haiku
---
This is the body content.`;

      const parsed = parse(original);
      const printed = print(parsed.frontMatter, parsed.body);
      const reparsed = parse(printed);

      expect(reparsed.frontMatter['name']).toBe('test-agent');
      expect(reparsed.frontMatter['description']).toBe('A round-trip test');
      expect(reparsed.body).toContain('This is the body content.');
    });
  });
});
