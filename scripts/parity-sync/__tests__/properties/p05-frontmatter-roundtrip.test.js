/**
 * Property test P5 — Front-matter Round-trip.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/design.md > Correctness Properties >
 *       Property 5.
 * Task: tasks.md > 7.7 (PBT) Property test P5.
 *
 * **Validates: Requirements 3.5, 6.5, 11.2**
 *
 * Statement (design.md): For all file Markdown source có YAML front-matter
 * với field `name`, `inclusion`, hoặc `argument-hint`, nội dung file target
 * đã port có YAML front-matter với cùng giá trị các field đó. Đặc biệt, file
 * source có `name: claude-code` phải có target front-matter `name: claude-code`
 * (không bị rebrand thành `name: kiro`).
 *
 * Three property assertions (numRuns=100 each):
 *   5a Field preservation       — mọi giá trị `name`, `inclusion`,
 *                                 `argument-hint` source xuất hiện nguyên
 *                                 văn trong target front-matter.
 *   5b name=claude-code special — source có `name: claude-code` ⇒ target
 *                                 cũng có `name: claude-code`, kể cả khi
 *                                 body chứa "Claude Code" (đã bị rebrand
 *                                 thành "Kiro" tuỳ theo targetPath).
 *   5c Other-field rebrand      — field KHÔNG nằm trong preserve list
 *                                 (ví dụ `description`) bị áp substitutions
 *                                 (positive: source description chứa
 *                                 "ClaudeKit" → target description chứa
 *                                 "KiroKit").
 *
 * Generators:
 *   - `arbName`           — alnum + hyphen token, hoặc literal "claude-code".
 *   - `arbInclusion`      — enum {manual, always, fileMatch} (giá trị
 *                            phổ biến trong KiroKit/ClaudeKit front-matter).
 *   - `arbArgumentHint`   — `<...>` template string.
 *   - `arbFrontMatter`    — record với 0..n fields, luôn có ít nhất một
 *                            preserve field.
 *   - `arbBody`           — markdown body random.
 *
 * Note: Re-parse output qua `lib/yaml-front-matter` thay vì regex — giúp test
 * robust với mọi quirk gray-matter (line endings, quoting). Đây cũng là
 * "round-trip" thực sự theo Property 5 statement.
 */

'use strict';

const fc = require('fast-check');

const { rebrand } = require('../../rebrander');
const yamlFrontMatter = require('../../lib/yaml-front-matter');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbAlnumChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
);
const arbToken = fc
  .array(arbAlnumChar, { minLength: 1, maxLength: 8 })
  .map((arr) => arr.join(''));

// Skill/agent name format: alnum + hyphen, 1..3 segments. 25% bias to literal
// "claude-code" to ensure 5b property has signal.
const arbName = fc.oneof(
  { weight: 3, arbitrary: fc.array(arbToken, { minLength: 1, maxLength: 3 }).map((segs) => segs.join('-')) },
  { weight: 1, arbitrary: fc.constant('claude-code') },
);

const arbInclusion = fc.constantFrom('manual', 'always', 'fileMatch');

// argument-hint trông như "<feature>" hoặc "<a> <b>". Tránh chứa pattern
// rebrandable để giảm nhiễu khi test field preservation.
const arbArgumentHint = fc.array(arbToken, { minLength: 1, maxLength: 3 }).map(
  (segs) => '<' + segs.join('> <') + '>',
);

// Description có thể chứa pattern để test 5c (rebrand non-preserve fields).
const arbDescription = fc.oneof(
  fc.constant('Helps with ClaudeKit tasks.'),
  fc.constant('Use Claude Code to bootstrap.'),
  fc.constant('Edit .claude/agents/x.md to configure.'),
  fc.constant('A simple agent.'),
  fc.constant('Plain description with no patterns.'),
);

// Front-matter object: luôn có `name` (đảm bảo property 5a + 5b có signal),
// optional `inclusion`, `argument-hint`, `description`.
const arbFrontMatter = fc.record({
  name: arbName,
  inclusion: fc.option(arbInclusion, { nil: undefined }),
  'argument-hint': fc.option(arbArgumentHint, { nil: undefined }),
  description: fc.option(arbDescription, { nil: undefined }),
}).map((obj) => {
  // Strip undefined keys để gray-matter không serialize "key: undefined".
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) {
      out[k] = obj[k];
    }
  }
  return out;
});

// Body: text random có thể chứa pattern. Giữ ngắn cho perf.
const arbBody = fc.oneof(
  fc.constant('Plain markdown body.\n'),
  fc.constant('Use ClaudeKit to plan.\n'),
  fc.constant('See .claude/skills/x/SKILL.md.\n'),
  fc.constant('Claude Code reference.\n'),
  fc.constant(''),
);

// targetPath random. Một số map vào skills/claude-code/ để test exception.
const arbTargetPath = fc.oneof(
  { weight: 4, arbitrary: arbToken.map((t) => `presets/frontend/agents/${t}.md`) },
  { weight: 1, arbitrary: arbToken.map((t) => `presets/frontend/skills/claude-code/${t}.md`) },
  { weight: 1, arbitrary: fc.constant('') },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build source content with front-matter + body. Use yaml-front-matter
 * serialize so encoding matches what production uses (consistent quoting,
 * key order).
 *
 * @param {Record<string, unknown>} data
 * @param {string} body
 * @returns {string}
 */
function buildSource(data, body) {
  return yamlFrontMatter.serialize(data, body);
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('Property 5: Front-matter Round-trip — **Validates: Requirements 3.5, 6.5, 11.2**', () => {
  // Feature: claudekit-parity-sync, Property 5: Front-matter Round-trip

  it('5a: name, inclusion, argument-hint preserved nguyên văn sau rebrand', () => {
    fc.assert(
      fc.property(arbFrontMatter, arbBody, arbTargetPath, (data, body, targetPath) => {
        const source = buildSource(data, body);
        const output = rebrand(source, { targetPath });

        const reparsed = yamlFrontMatter.parse(output);

        expect(reparsed.hasFrontMatter).toBe(true);
        expect(reparsed.data.name).toBe(data.name);

        if (Object.prototype.hasOwnProperty.call(data, 'inclusion')) {
          expect(reparsed.data.inclusion).toBe(data.inclusion);
        }
        if (Object.prototype.hasOwnProperty.call(data, 'argument-hint')) {
          expect(reparsed.data['argument-hint']).toBe(data['argument-hint']);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('5b: name=claude-code survives — source name=claude-code ⇒ target name=claude-code', () => {
    // Fix name = 'claude-code'; randomize other fields + body + targetPath.
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constant('claude-code'),
          inclusion: fc.option(arbInclusion, { nil: undefined }),
          description: fc.option(arbDescription, { nil: undefined }),
        }).map((obj) => {
          /** @type {Record<string, unknown>} */
          const out = {};
          for (const k of Object.keys(obj)) {
            if (obj[k] !== undefined) out[k] = obj[k];
          }
          return out;
        }),
        arbBody,
        arbTargetPath,
        (data, body, targetPath) => {
          const source = buildSource(data, body);
          const output = rebrand(source, { targetPath });

          const reparsed = yamlFrontMatter.parse(output);

          expect(reparsed.hasFrontMatter).toBe(true);
          expect(reparsed.data.name).toBe('claude-code');

          // Sanity: output không bao giờ có "name: kiro" (substring trong
          // serialized form).
          expect(output.includes('name: kiro\n')).toBe(false);
          expect(output.includes('name: kiro\r\n')).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('5c: non-preserve fields — description chứa ClaudeKit ⇒ target description chứa KiroKit', () => {
    fc.assert(
      fc.property(
        arbName,
        fc.constantFrom(
          'Helps with ClaudeKit tasks.',
          'A KiroKit-style helper for ClaudeKit users.',
          'Use ClaudeKit, not anything else.',
        ),
        arbBody,
        (name, description, body) => {
          const data = { name, description };
          const source = buildSource(data, body);
          // targetPath không chứa marker → đầy đủ rebrand áp dụng.
          const output = rebrand(source, { targetPath: 'presets/frontend/agents/x.md' });

          const reparsed = yamlFrontMatter.parse(output);

          // Field name vẫn preserved.
          expect(reparsed.data.name).toBe(name);

          // Description đã bị rebrand: không còn "ClaudeKit", có "KiroKit".
          expect(typeof reparsed.data.description).toBe('string');
          expect(reparsed.data.description.includes('ClaudeKit')).toBe(false);
          expect(reparsed.data.description.includes('KiroKit')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
