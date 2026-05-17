/**
 * Golden-file tests for Rebrander.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/design.md > Testing Strategy >
 *       "Golden-file tests cho Rebrander".
 * Task: tasks.md > 7.5 — 15 fixture pairs `<n>-<name>.input.md` +
 *       `<n>-<name>.expected.md`.
 *
 * Strategy (design.md): Rebrand Rule là string transformation thuần, golden
 * file là cách test mạnh nhất — input fixture trong cùng directory này, expected
 * output trong cùng directory này, test chạy `rebrand` rồi diff. Maintainer
 * có thể review thay đổi rule bằng cách commit golden file.
 *
 * Discovery: tự động scan thư mục `__tests__/golden/`, ghép cặp `*.input.md`
 * với `*.expected.md` cùng prefix. Yêu cầu mỗi fixture có cả hai file (test
 * fail nếu thiếu).
 *
 * Target path inference: tên fixture chứa `skills-claude-code` → set
 * `targetPath` thành `presets/frontend/skills/claude-code/SKILL.md` để kích
 * hoạt exception "Claude Code phrase preserved" (fixture 07, 08). Mọi
 * fixture khác → `targetPath` rỗng (default rebrand).
 *
 * Pure CommonJS, đồng bộ I/O — không cần fast-check.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { rebrand } = require('../../rebrander');

/**
 * Normalize line endings to LF. Fixture files commit/checkout với
 * `core.autocrlf` có thể chuyển CRLF; rebrander luôn output LF (gray-matter
 * normalize). So sánh sau khi normalize để golden tests robust cross-platform.
 *
 * @param {string} s
 * @returns {string}
 */
function normalizeEol(s) {
  return s.replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------
// Fixture discovery
// ---------------------------------------------------------------------------

/**
 * Scan `__dirname` ghép cặp input/expected. Trả về mảng entries dạng
 * `{ name, inputPath, expectedPath, targetPath }` đã sort ổn định theo `name`.
 *
 * @returns {Array<{ name: string, inputPath: string, expectedPath: string, targetPath: string }>}
 */
function discoverFixtures() {
  const dir = __dirname;
  const files = fs.readdirSync(dir);
  const inputs = files.filter((f) => f.endsWith('.input.md')).sort();

  const fixtures = inputs.map((inputName) => {
    const base = inputName.slice(0, -'.input.md'.length);
    const expectedName = `${base}.expected.md`;
    const expectedPath = path.join(dir, expectedName);
    if (!fs.existsSync(expectedPath)) {
      throw new Error(
        `Golden fixture ${inputName} thiếu file expected: ${expectedName}`,
      );
    }

    // Heuristic targetPath: kích hoạt exception khi tên fixture chứa
    // "skills-claude-code" (fixture 07, 08). Còn lại default — Claude Code
    // phrase BỊ rebrand.
    const targetPath = base.includes('skills-claude-code')
      ? 'presets/frontend/skills/claude-code/SKILL.md'
      : '';

    return {
      name: base,
      inputPath: path.join(dir, inputName),
      expectedPath,
      targetPath,
    };
  });

  return fixtures;
}

const FIXTURES = discoverFixtures();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Rebrander golden-file tests — Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5', () => {
  it(`discovers exactly 15 fixture pairs`, () => {
    expect(FIXTURES.length).toBe(15);
  });

  for (const fixture of FIXTURES) {
    it(`golden: ${fixture.name}`, () => {
      const input = fs.readFileSync(fixture.inputPath, 'utf8');
      const expected = normalizeEol(fs.readFileSync(fixture.expectedPath, 'utf8'));

      const actual = normalizeEol(rebrand(input, { targetPath: fixture.targetPath }));

      expect(actual).toBe(expected);
    });
  }
});
