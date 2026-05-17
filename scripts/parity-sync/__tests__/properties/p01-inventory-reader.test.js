/**
 * Property test P1 — InventoryReader Soundness.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/design.md > Correctness Properties >
 *       Property 1.
 * Task: tasks.md > 2.4 (PBT) Property test P1.
 *
 * **Validates: Requirements 1.1, 1.4**
 *
 * Five property assertions (numRuns=100 each):
 *   1a Source count fidelity      — N items in -> N items out, fields preserved.
 *   1b Source missing/empty       — nonexistent dir / empty / whitespace ->
 *                                   InventoryError(E_INV_MISSING).
 *   1c Source malformed JSON      — random non-JSON string ->
 *                                   InventoryError(E_INV_SCHEMA).
 *   1d Target line count fidelity — M paths per preset (7 presets) ->
 *                                   byPreset[p].length === M_p, paths
 *                                   round-trip via normalizeRelPath.
 *   1e Schema rejection on        — drop one of 4 required fields ->
 *      missing field                InventoryError(E_INV_SCHEMA).
 *
 * Implementation notes:
 *   - Pure CommonJS (require). Each `it` block uses beforeEach/afterEach to
 *     create / clean a unique tmpdir under os.tmpdir().
 *   - Generators constrained to keep file I/O cheap and stay inside
 *     normalizeRelPath's accepted shape (no traversal, no absolute paths).
 *   - Numerical limits chosen so 100 runs complete < 5s on a typical laptop.
 */

'use strict';

const fc = require('fast-check');
const fs = require('fs');
const os = require('os');
const path = require('path');
// `describe`, `it`, `expect`, `beforeEach`, `afterEach` are exposed as globals
// via `globals: true` in scripts/parity-sync/vitest.config.js — Vitest 2.x
// blocks `require('vitest')` from CommonJS files.

const {
  readSource,
  readTarget,
  InventoryError,
  SOURCE_INVENTORY_FILENAME,
  targetListFilename,
  REQUIRED_SOURCE_FIELDS,
} = require('../../inventory-reader');
const { VALID_PRESETS, normalizeRelPath } = require('../../lib/path-utils');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// Lower-case alnum char (safe for filenames, ids, segments).
const arbAlnumChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
);

// Non-empty alnum token (1..15 chars). Used for ids and path segments.
const arbToken = fc
  .array(arbAlnumChar, { minLength: 1, maxLength: 15 })
  .map((arr) => arr.join(''));

// Source category subdirectory under .claude/.
const arbSourceCategory = fc.constantFrom(
  'agents',
  'commands',
  'skills',
  'hooks',
  'workflows',
);

// Build a clean POSIX-style source path, e.g.:
//   "claudekit-engineer-main/.claude/agents/foo/bar.md"
// Always 4 segments to keep paths recognisable; 2 random tokens prevent
// collisions across runs.
const arbSourcePath = fc
  .tuple(arbSourceCategory, arbToken, arbToken)
  .map(([cat, mid, base]) => `claudekit-engineer-main/.claude/${cat}/${mid}/${base}.md`);

// Source artifact_type — kept narrow on purpose; reader only requires non-empty
// string, but constraining here helps the property assert real data shapes.
const arbArtifactType = fc.constantFrom(
  'agent',
  'command',
  'skill',
  'hook',
  'workflow',
);

// One valid SourceItem (minimum required fields).
const arbValidSourceItem = fc.record({
  id: arbToken,
  kit: fc.constant('source'),
  artifact_type: arbArtifactType,
  path: arbSourcePath,
});

const arbValidSourceArray = fc.array(arbValidSourceItem, {
  minLength: 1,
  maxLength: 50,
});

// Single POSIX-relative path with 1..4 alnum segments + ".md" suffix on last.
const arbPosixPath = fc
  .array(arbToken, { minLength: 1, maxLength: 4 })
  .map((segs) => segs.join('/') + '.md');

// Whitespace-only string (1..20 chars) — for "empty after trim" cases.
const arbWhitespaceContent = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 })
  .map((chars) => chars.join(''));

// Missing-source scenarios for property 1b.
const arbMissingScenario = fc.oneof(
  fc.constant({ kind: 'nonexistent' }),
  fc.constant({ kind: 'empty' }),
  arbWhitespaceContent.map((content) => ({ kind: 'whitespace', content })),
);

// Malformed JSON: random string (1..200 chars) that fails JSON.parse and is
// not whitespace-only (whitespace-only would trigger E_INV_MISSING instead).
const arbMalformedJson = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => {
    if (s.trim() === '') return false;
    try {
      JSON.parse(s);
      return false;
    } catch (_e) {
      return true;
    }
  });

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

let tmpDir = '';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-sync-pbt-'));
});

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = '';
});

/**
 * Write a single-line stub for every preset's target-files-*.txt so
 * readTarget would not throw E_INV_MISSING. Used when the property focuses
 * on source-only behaviour but we want the appendix dir well-formed.
 */
function writeMinimalTargetStubs(dir) {
  for (const preset of VALID_PRESETS) {
    fs.writeFileSync(
      path.join(dir, targetListFilename(preset)),
      `presets/${preset}/agents/stub.md\n`,
      'utf8',
    );
  }
}

/**
 * Capture an error thrown by `fn()`; return null if no throw.
 */
function captureError(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

// ---------------------------------------------------------------------------
// Property assertions
// ---------------------------------------------------------------------------

describe('Property 1: InventoryReader Soundness — **Validates: Requirements 1.1, 1.4**', () => {
  it('1a: source count fidelity — N items in -> N items out, fields preserved', () => {
    fc.assert(
      fc.property(arbValidSourceArray, (items) => {
        const sourceFile = path.join(tmpDir, SOURCE_INVENTORY_FILENAME);
        fs.writeFileSync(sourceFile, JSON.stringify(items), 'utf8');
        writeMinimalTargetStubs(tmpDir);

        const { items: got } = readSource(tmpDir);

        expect(got.length).toBe(items.length);
        for (let i = 0; i < items.length; i++) {
          expect(got[i].id).toBe(items[i].id);
          expect(got[i].kit).toBe(items[i].kit);
          expect(got[i].artifact_type).toBe(items[i].artifact_type);
          // Path is normalized; compare under normalize equivalence.
          expect(got[i].path).toBe(normalizeRelPath(items[i].path));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('1b: source missing or empty -> InventoryError(E_INV_MISSING)', () => {
    fc.assert(
      fc.property(arbMissingScenario, (scenario) => {
        let dir = tmpDir;
        if (scenario.kind === 'nonexistent') {
          // Point at a sub-directory we never create.
          dir = path.join(tmpDir, 'never-created-' + Math.random().toString(36).slice(2));
        } else {
          const sourceFile = path.join(tmpDir, SOURCE_INVENTORY_FILENAME);
          const content = scenario.kind === 'empty' ? '' : scenario.content;
          fs.writeFileSync(sourceFile, content, 'utf8');
        }

        const err = captureError(() => readSource(dir));
        expect(err).toBeInstanceOf(InventoryError);
        expect(err.code).toBe('E_INV_MISSING');
      }),
      { numRuns: 100 },
    );
  });

  it('1c: source malformed JSON -> InventoryError(E_INV_SCHEMA)', () => {
    fc.assert(
      fc.property(arbMalformedJson, (content) => {
        const sourceFile = path.join(tmpDir, SOURCE_INVENTORY_FILENAME);
        fs.writeFileSync(sourceFile, content, 'utf8');

        const err = captureError(() => readSource(tmpDir));
        expect(err).toBeInstanceOf(InventoryError);
        expect(err.code).toBe('E_INV_SCHEMA');
      }),
      { numRuns: 100 },
    );
  });

  it('1d: target line count fidelity — paths round-trip across all 7 presets', () => {
    // Generate one array of paths per preset (parallel order with VALID_PRESETS).
    const arbPathsPerPreset = fc.tuple(
      ...VALID_PRESETS.map(() =>
        fc.array(arbPosixPath, { minLength: 1, maxLength: 30 }),
      ),
    );

    fc.assert(
      fc.property(arbPathsPerPreset, (pathsPerPreset) => {
        // Need a valid source inventory so readSource side-effects don't
        // matter, but readTarget is independent — we still write source so
        // future readAll-style tests stay happy. Skip source for speed.
        for (let i = 0; i < VALID_PRESETS.length; i++) {
          const preset = VALID_PRESETS[i];
          const lines = pathsPerPreset[i].join('\n') + '\n';
          fs.writeFileSync(
            path.join(tmpDir, targetListFilename(preset)),
            lines,
            'utf8',
          );
        }

        const { byPreset } = readTarget(tmpDir);

        for (let i = 0; i < VALID_PRESETS.length; i++) {
          const preset = VALID_PRESETS[i];
          const expected = pathsPerPreset[i];
          const got = byPreset[preset];

          expect(got).toBeDefined();
          expect(got.length).toBe(expected.length);

          for (let j = 0; j < expected.length; j++) {
            expect(got[j].preset).toBe(preset);
            expect(got[j].path).toBe(normalizeRelPath(expected[j]));
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('1e: schema rejection — dropping any required field -> InventoryError(E_INV_SCHEMA)', () => {
    const arbItemsWithDeletion = fc.tuple(
      fc.array(arbValidSourceItem, { minLength: 1, maxLength: 20 }),
      fc.nat(),
      fc.constantFrom(...REQUIRED_SOURCE_FIELDS),
    );

    fc.assert(
      fc.property(arbItemsWithDeletion, ([items, indexSeed, fieldToDelete]) => {
        const targetIdx = indexSeed % items.length;
        const mutated = items.map((item, j) => {
          if (j !== targetIdx) return item;
          const copy = { ...item };
          delete copy[fieldToDelete];
          return copy;
        });

        fs.writeFileSync(
          path.join(tmpDir, SOURCE_INVENTORY_FILENAME),
          JSON.stringify(mutated),
          'utf8',
        );

        const err = captureError(() => readSource(tmpDir));
        expect(err).toBeInstanceOf(InventoryError);
        expect(err.code).toBe('E_INV_SCHEMA');
      }),
      { numRuns: 100 },
    );
  });
});
