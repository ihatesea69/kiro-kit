import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildRenderLines } from '../../src/commands/init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip all ANSI escape sequences from a string. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

/** Visible character width of a string (ANSI stripped). */
function visibleWidth(s: string): number {
  return stripAnsi(s).length;
}

function makeItems(descriptions: string[]): Array<{ name: string; description: string }> {
  return descriptions.map((description, i) => ({ name: `preset${i}`, description }));
}

// ---------------------------------------------------------------------------
// Exploratory tests — demonstrate the bug on the UNFIXED render path.
//
// These tests call buildRenderLines (the extracted, fixed helper) and assert
// that every returned line fits within the given column width.  They are
// written to document the bug condition: if the old inline render were used
// (no truncation), these assertions would fail for long descriptions.
//
// With the fix in place they pass, confirming the fix resolves the condition.
// ---------------------------------------------------------------------------

describe('Exploratory: bug condition — long descriptions exceed terminal width', () => {
  it('single item with 100-char description on 80-col terminal: line count equals items.length + 1', () => {
    const items = makeItems(['x'.repeat(100)]);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    // Must be exactly 2 lines (1 header + 1 item), not 3
    expect(lines).toHaveLength(2);
  });

  it('three items all with 100-char descriptions on 80-col terminal: line count equals items.length + 1', () => {
    const items = makeItems(['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100)]);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    expect(lines).toHaveLength(4); // 1 header + 3 items
  });

  it('mixed lengths — some long, some short — line count still equals items.length + 1', () => {
    const items = makeItems(['short', 'x'.repeat(200), 'also short', 'y'.repeat(150)]);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    expect(lines).toHaveLength(5);
  });

  it('all-short descriptions (baseline): line count equals items.length + 1', () => {
    const items = makeItems(['frontend', 'backend', 'fullstack']);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    expect(lines).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Fix-checking tests — Property 1
// Validates: Requirements 2.1, 2.2, 2.3
// ---------------------------------------------------------------------------

describe('Property 1: Bug Condition — description truncation prevents line wrapping', () => {
  it('every rendered item line fits within terminal columns', () => {
    fc.assert(
      fc.property(
        // At least one description that would exceed 80 cols
        fc.array(
          fc.string({ minLength: 57, maxLength: 300 }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.integer({ min: 40, max: 220 }),
        (descriptions, cols) => {
          const items = makeItems(descriptions);
          const lines = buildRenderLines(items, 0, new Set(), cols);
          // Item lines (index 1+) must fit within cols.
          // The header (index 0) is a fixed string we intentionally don't truncate.
          for (const line of lines.slice(1)) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(cols);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('total line count always equals items.length + 1 regardless of description length', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 500 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 40, max: 220 }),
        (descriptions, cols) => {
          const items = makeItems(descriptions);
          const lines = buildRenderLines(items, 0, new Set(), cols);
          expect(lines).toHaveLength(items.length + 1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('truncated description ends with ellipsis when over limit', () => {
    const items = makeItems(['x'.repeat(200)]);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    const itemLine = stripAnsi(lines[1]);
    expect(itemLine).toContain('\u2026');
  });
});

// ---------------------------------------------------------------------------
// Preservation-checking tests — Property 2
// Validates: Requirements 3.5
// ---------------------------------------------------------------------------

describe('Property 2: Preservation — short descriptions render unchanged', () => {
  it('descriptions that fit within terminal width are not truncated', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 220 }),
        fc.array(
          // descriptions short enough to always fit (max 10 chars, prefix is 24)
          fc.string({ minLength: 0, maxLength: 10 }),
          { minLength: 1, maxLength: 8 },
        ),
        (cols, descriptions) => {
          const items = makeItems(descriptions);
          const lines = buildRenderLines(items, 0, new Set(), cols);
          // No line should contain the truncation ellipsis
          for (const line of lines) {
            expect(stripAnsi(line)).not.toContain('\u2026');
          }
          // Line count is still correct
          expect(lines).toHaveLength(items.length + 1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('description exactly at maxDescWidth is not truncated', () => {
    // cols=80, prefix=23, maxDescWidth=57
    const maxDescWidth = 80 - 23;
    const items = makeItems(['x'.repeat(maxDescWidth)]);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    expect(stripAnsi(lines[1])).not.toContain('\u2026');
  });

  it('two renders with identical short-description inputs produce identical output', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 10 }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 40, max: 220 }),
        (descriptions, cols) => {
          const items = makeItems(descriptions);
          const lines1 = buildRenderLines(items, 0, new Set(), cols);
          const lines2 = buildRenderLines(items, 0, new Set(), cols);
          expect(lines1).toEqual(lines2);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — edge cases
// Validates: Requirements 2.1, 3.5
// ---------------------------------------------------------------------------

describe('Unit: edge cases', () => {
  it('falls back to 80 columns when columns is undefined', () => {
    const items = makeItems(['x'.repeat(200)]);
    // Pass undefined — should not throw and item lines should fit 80 cols
    const lines = buildRenderLines(items, 0, new Set(), undefined);
    expect(lines).toHaveLength(2);
    // Check item lines only (header is a fixed string, not truncated)
    for (const line of lines.slice(1)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(80);
    }
  });

  it('empty description renders without error and without ellipsis', () => {
    const items = makeItems(['']);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    expect(lines).toHaveLength(2);
    expect(stripAnsi(lines[1])).not.toContain('\u2026');
  });

  it('description exactly one character over limit gets truncated with ellipsis', () => {
    // cols=80, PROMPT_PREFIX_WIDTH=23, maxDescWidth=57
    const maxDescWidth = 80 - 23;
    const items = makeItems(['x'.repeat(maxDescWidth + 1)]);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    expect(stripAnsi(lines[1])).toContain('\u2026');
  });

  it('description exactly at maxDescWidth is not truncated', () => {
    // cols=80, PROMPT_PREFIX_WIDTH=23, maxDescWidth=57
    const maxDescWidth = 80 - 23;
    const items = makeItems(['x'.repeat(maxDescWidth)]);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    expect(stripAnsi(lines[1])).not.toContain('\u2026');
    expect(visibleWidth(lines[1])).toBeLessThanOrEqual(80);
  });

  it('selected item renders [x] marker', () => {
    const items = makeItems(['frontend']);
    const selected = new Set([0]);
    const lines = buildRenderLines(items, 0, selected, 80);
    expect(stripAnsi(lines[1])).toContain('[x]');
  });

  it('unselected item renders [ ] marker', () => {
    const items = makeItems(['frontend']);
    const lines = buildRenderLines(items, 0, new Set(), 80);
    expect(stripAnsi(lines[1])).toContain('[ ]');
  });

  it('cursor item renders > marker', () => {
    const items = makeItems(['frontend', 'backend']);
    const lines = buildRenderLines(items, 1, new Set(), 80);
    expect(stripAnsi(lines[2])).toContain('>');
    expect(stripAnsi(lines[1])).not.toMatch(/>\s/);
  });

  it('very narrow terminal (cols=10) does not crash', () => {
    const items = makeItems(['a long description that would normally wrap']);
    expect(() => buildRenderLines(items, 0, new Set(), 10)).not.toThrow();
    const lines = buildRenderLines(items, 0, new Set(), 10);
    expect(lines).toHaveLength(2);
  });
});
