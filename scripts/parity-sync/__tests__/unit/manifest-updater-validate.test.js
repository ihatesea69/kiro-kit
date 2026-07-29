/**
 * Unit test: ManifestUpdater sub-task 11.3 — validate manifest in-memory
 * trên 3 invariant của design.md "Validate cuối cùng" + Property 7:
 *
 *   1. Round-trip JSON.parse(JSON.stringify(manifest)) deepEqual    (Req 19.6)
 *   2. Mọi entry.source phải tồn tại trên đĩa                         (Req 19.7)
 *   3. Mọi file vật lý (trừ manifest.json + README.md) phải có entry  (Req 13.3)
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Task: tasks.md > 11.3 — "Validate: round-trip JSON.parse → JSON.stringify,
 *       no orphan, no broken link".
 *
 * Coverage map:
 *   - validate: ok case (well-formed manifest matching disk).
 *   - validate: missing source file → E_MANIFEST_BROKEN_LINK.
 *   - validate: file on disk not in manifest → E_MANIFEST_ORPHAN.
 *   - validate: non-serializable manifest → E_MANIFEST_INVALID.
 *   - smoke: real presets/frontend/manifest.json đối chiếu filesystem
 *           thật — báo cáo bất kỳ pre-existing inconsistency nào.
 *
 * Strategy: dùng REAL fs với `os.tmpdir()` để build preset fixture (cùng
 * pattern manifest-updater-sort.test.js + atomic-writer.test.js). Không
 * mock — validate là pure function của (manifest, filesystem state) và
 * cần fs thật để cover orphan walk + statSync broken-link path.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  validate,
  deepEqual,
  walkPresetFiles,
  ORPHAN_CHECK_EXEMPT,
} = require('../../manifest-updater');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

function makeTmpWorkspace() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(
    os.tmpdir(),
    `parity-sync-validate-test-${process.pid}-${id}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort.
  }
}

/**
 * Build một preset fixture dưới `<workspaceRoot>/presets/<preset>/` với
 * danh sách POSIX-style relative paths. Với mỗi path tạo file rỗng (đủ
 * để fs.statSync nhận diện là file).
 *
 * @param {string} workspaceRoot
 * @param {string} preset
 * @param {string[]} relativePaths
 */
function scaffoldPreset(workspaceRoot, preset, relativePaths) {
  const presetDir = path.join(workspaceRoot, 'presets', preset);
  fs.mkdirSync(presetDir, { recursive: true });
  for (const rel of relativePaths) {
    const osRel = rel.split('/').join(path.sep);
    const full = path.join(presetDir, osRel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '');
  }
}

// ---------------------------------------------------------------------------
// deepEqual
// ---------------------------------------------------------------------------

describe('deepEqual — manifest round-trip helper', () => {
  it('treats primitives correctly', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('detects NaN as not equal (matches JSON round-trip semantics)', () => {
    // JSON.stringify(NaN) === 'null', so round-trip yields null. We want
    // validate() to flag NaN as a non-serializable case.
    expect(deepEqual(NaN, NaN)).toBe(false);
    expect(deepEqual(NaN, null)).toBe(false);
  });

  it('compares arrays element-wise', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual([1, [2, 3]], [1, [2, 4]])).toBe(false);
  });

  it('compares plain objects key-wise', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(true);
    expect(deepEqual({ a: { x: 1 } }, { a: { x: 2 } })).toBe(false);
  });

  it('rejects array-vs-object even when length matches', () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// walkPresetFiles
// ---------------------------------------------------------------------------

describe('walkPresetFiles — recursive POSIX listing', () => {
  /** @type {string} */
  let dir;
  beforeEach(() => { dir = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(dir); });

  it('returns empty array for non-existent dir', () => {
    expect(walkPresetFiles(path.join(dir, 'nope'))).toEqual([]);
  });

  it('lists files recursively with POSIX separators', () => {
    scaffoldPreset(dir, 'frontend', [
      'agents/foo.md',
      'skills/bar/SKILL.md',
      'manifest.json',
      '.env.example',
    ]);
    const out = walkPresetFiles(path.join(dir, 'presets', 'frontend')).sort();
    expect(out).toEqual([
      '.env.example',
      'agents/foo.md',
      'manifest.json',
      'skills/bar/SKILL.md',
    ]);
  });

  it('skips node_modules subtree', () => {
    scaffoldPreset(dir, 'frontend', [
      'agents/foo.md',
      'node_modules/lodash/index.js',
      'node_modules/lodash/package.json',
    ]);
    const out = walkPresetFiles(path.join(dir, 'presets', 'frontend')).sort();
    expect(out).toEqual(['agents/foo.md']);
  });

  it('includes dot-files (.env.example, .gitkeep) for orphan detection', () => {
    scaffoldPreset(dir, 'frontend', [
      'skills/bar/.env.example',
      'skills/bar/scripts/.gitkeep',
    ]);
    const out = walkPresetFiles(path.join(dir, 'presets', 'frontend')).sort();
    expect(out).toEqual([
      'skills/bar/.env.example',
      'skills/bar/scripts/.gitkeep',
    ]);
  });
});

// ---------------------------------------------------------------------------
// validate — input validation
// ---------------------------------------------------------------------------

describe('validate — input shape', () => {
  it('throws TypeError when manifest is not a plain object', () => {
    expect(() => validate(/** @type {any} */ (null), { preset: 'frontend' }))
      .toThrow(TypeError);
    expect(() => validate(/** @type {any} */ ([]), { preset: 'frontend' }))
      .toThrow(TypeError);
    expect(() => validate(/** @type {any} */ ('x'), { preset: 'frontend' }))
      .toThrow(TypeError);
  });

  it('throws TypeError when options or preset missing/invalid', () => {
    expect(() => validate({}, /** @type {any} */ (null))).toThrow(TypeError);
    expect(() => validate({}, /** @type {any} */ ({}))).toThrow(TypeError);
    expect(() => validate({}, { preset: 'unknown-preset' })).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// validate — happy path: ok manifest
// ---------------------------------------------------------------------------

describe('validate — ok case (manifest matches disk)', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('returns { ok: true, errors: [] } when manifest matches disk exactly', () => {
    const files = [
      'agents/foo.md',
      'skills/bar/SKILL.md',
      '.env.example',
      'README.md', // exempt from orphan check
      'manifest.json', // exempt from orphan check
    ];
    scaffoldPreset(workspaceRoot, 'frontend', files);

    const manifest = {
      name: 'frontend',
      version: '1.0.0',
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
        { source: 'skills/bar/SKILL.md', target: '.kiro/skills/bar/SKILL.md', type: 'skill' },
        { source: '.env.example', target: '.env.example', type: 'config' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('does not mutate the input manifest', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = {
      name: 'frontend',
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(manifest));
    validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(manifest).toEqual(snapshot);
  });

  it('skips manifest.json and README.md from orphan check (design exemption)', () => {
    expect(ORPHAN_CHECK_EXEMPT.has('manifest.json')).toBe(true);
    expect(ORPHAN_CHECK_EXEMPT.has('README.md')).toBe(true);
    expect(ORPHAN_CHECK_EXEMPT.has('.env.example')).toBe(false);
    expect(ORPHAN_CHECK_EXEMPT.has('.mcp.json.example')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validate — broken link
// ---------------------------------------------------------------------------

describe('validate — broken link (Req 19.7)', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('flags entry whose source file does not exist on disk', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = {
      name: 'frontend',
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
        { source: 'agents/missing.md', target: '.kiro/agents/missing.md', type: 'agent' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(false);

    const brokenLinks = result.errors.filter(
      (e) => e.code === 'E_MANIFEST_BROKEN_LINK',
    );
    expect(brokenLinks).toHaveLength(1);
    expect(brokenLinks[0].path).toBe('agents/missing.md');
    expect(brokenLinks[0].message).toContain('agents/missing.md');
  });

  it('flags entry pointing to a directory (not a file)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    // Create empty dir at the path the entry claims is a file.
    fs.mkdirSync(
      path.join(workspaceRoot, 'presets', 'frontend', 'agents', 'subdir'),
      { recursive: true },
    );

    const manifest = {
      files: [
        { source: 'agents/subdir', target: '.kiro/agents/subdir', type: 'agent' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    const brokenLinks = result.errors.filter(
      (e) => e.code === 'E_MANIFEST_BROKEN_LINK',
    );
    expect(brokenLinks.length).toBeGreaterThanOrEqual(1);
    expect(brokenLinks[0].path).toBe('agents/subdir');
  });

  it('reports multiple broken links in one pass', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = {
      files: [
        { source: 'agents/missing-1.md', target: '.kiro/m1.md', type: 'agent' },
        { source: 'agents/missing-2.md', target: '.kiro/m2.md', type: 'agent' },
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    const brokenLinks = result.errors.filter(
      (e) => e.code === 'E_MANIFEST_BROKEN_LINK',
    );
    expect(brokenLinks).toHaveLength(2);
    expect(brokenLinks.map((e) => e.path).sort())
      .toEqual(['agents/missing-1.md', 'agents/missing-2.md']);
  });
});

// ---------------------------------------------------------------------------
// validate — orphan
// ---------------------------------------------------------------------------

describe('validate — orphan (Req 13.3)', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('flags physical file that has no manifest entry', () => {
    scaffoldPreset(workspaceRoot, 'frontend', [
      'agents/foo.md',
      'agents/orphan.md', // not in manifest below
    ]);
    const manifest = {
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(false);

    const orphans = result.errors.filter((e) => e.code === 'E_MANIFEST_ORPHAN');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].path).toBe('agents/orphan.md');
  });

  it('does not flag manifest.json or README.md as orphan', () => {
    scaffoldPreset(workspaceRoot, 'frontend', [
      'agents/foo.md',
      'manifest.json',
      'README.md',
    ]);
    const manifest = {
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('flags .env.example and .mcp.json.example as orphans (only manifest/README exempt)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', [
      'agents/foo.md',
      '.env.example',
      '.mcp.json.example',
    ]);
    const manifest = {
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    const orphans = result.errors
      .filter((e) => e.code === 'E_MANIFEST_ORPHAN')
      .map((e) => e.path)
      .sort();
    expect(orphans).toEqual(['.env.example', '.mcp.json.example']);
  });

  it('reports multiple orphans deterministically (sorted)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', [
      'agents/foo.md',
      'agents/zzz.md',
      'agents/aaa.md',
      'agents/mmm.md',
    ]);
    const manifest = {
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    const orphanPaths = result.errors
      .filter((e) => e.code === 'E_MANIFEST_ORPHAN')
      .map((e) => e.path);
    // Output is sorted ascending → stable across runs.
    expect(orphanPaths).toEqual(['agents/aaa.md', 'agents/mmm.md', 'agents/zzz.md']);
  });
});

// ---------------------------------------------------------------------------
// validate — non-serializable (round-trip JSON)
// ---------------------------------------------------------------------------

describe('validate — non-serializable manifest (Req 19.6)', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('flags `undefined` value in manifest as E_MANIFEST_INVALID', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = /** @type {any} */ ({
      name: 'frontend',
      // `undefined` is dropped by JSON.stringify → round-trip mismatch.
      description: undefined,
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    });

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(false);
    const invalid = result.errors.filter((e) => e.code === 'E_MANIFEST_INVALID');
    expect(invalid.length).toBeGreaterThanOrEqual(1);
  });

  it('flags `function` value in manifest as E_MANIFEST_INVALID', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = /** @type {any} */ ({
      name: 'frontend',
      onLoad: () => 'hello', // dropped by JSON.stringify.
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    });

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'E_MANIFEST_INVALID'),
    ).toBe(true);
  });

  it('flags NaN value as E_MANIFEST_INVALID (stringify → null)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = /** @type {any} */ ({
      name: 'frontend',
      score: NaN,
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    });

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'E_MANIFEST_INVALID'),
    ).toBe(true);
  });

  it('flags circular reference as E_MANIFEST_INVALID and short-circuits', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    /** @type {any} */
    const manifest = {
      name: 'frontend',
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };
    manifest.self = manifest; // circular.

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(false);
    // Short-circuit: only the round-trip error, no broken-link / orphan
    // checks were attempted on a manifest that can't be stringified.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E_MANIFEST_INVALID');
  });

  it('flags malformed entry shape (missing source) as E_MANIFEST_INVALID', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = {
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
        /** @type {any} */ ({ target: '.kiro/x', type: 'agent' }), // no source
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) => e.code === 'E_MANIFEST_INVALID' && /Entry \[1\]/.test(e.message),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validate — combined errors
// ---------------------------------------------------------------------------

describe('validate — accumulates multiple error categories without throwing', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('reports orphan AND broken-link in the same call', () => {
    scaffoldPreset(workspaceRoot, 'frontend', [
      'agents/foo.md',
      'agents/extra-orphan.md', // physical file with no entry.
    ]);
    const manifest = {
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
        { source: 'agents/missing.md', target: '.kiro/m.md', type: 'agent' },
      ],
    };

    const result = validate(manifest, { preset: 'frontend', workspaceRoot });
    expect(result.ok).toBe(false);

    const codes = result.errors.map((e) => e.code).sort();
    expect(codes).toEqual(['E_MANIFEST_BROKEN_LINK', 'E_MANIFEST_ORPHAN']);
  });

  it('does not throw for any validation failure (only TypeError for shape)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md', 'orphan.md']);
    const manifest = /** @type {any} */ ({
      bad: undefined,
      files: [{ source: 'agents/missing.md', target: '.kiro/m.md', type: 'agent' }],
    });
    expect(() =>
      validate(manifest, { preset: 'frontend', workspaceRoot })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Smoke test — real presets/frontend/manifest.json against actual filesystem
// ---------------------------------------------------------------------------

describe('validate — smoke test on real presets/frontend/manifest.json', () => {
  it('reports current state of presets/frontend (round-trip + broken-link must pass)', () => {
    // Resolve workspace root: this file is at
    //   scripts/parity-sync/__tests__/unit/manifest-updater-validate.test.js
    // → workspace root is 4 levels up.
    const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const manifestPath = path.join(workspaceRoot, 'presets', 'frontend', 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `Smoke test fixture missing: ${manifestPath}. Adjust workspaceRoot path.`,
      );
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const result = validate(manifest, { preset: 'frontend', workspaceRoot });

    // Round-trip and broken-link must always be clean for the current
    // preset state — these are correctness invariants we never want to
    // regress.
    const invalidErrors = result.errors.filter((e) => e.code === 'E_MANIFEST_INVALID');
    const brokenLinks = result.errors.filter((e) => e.code === 'E_MANIFEST_BROKEN_LINK');
    expect(invalidErrors).toEqual([]);
    expect(brokenLinks).toEqual([]);

    // Orphans are reported but not asserted to zero — the current
    // presets/frontend/ tree contains 3 .gitkeep placeholders under
    // skills/template-skill/{assets,references,scripts}/ that are not
    // (yet) tracked in manifest.json. Phase 6 (task 14.x) will resolve
    // these by either adding entries or removing the placeholders. For
    // now the smoke test surfaces them as a known-pending state — log
    // them so a future regression on broken-link / round-trip is not
    // masked, while pre-existing orphans remain visible.
    const orphans = result.errors.filter((e) => e.code === 'E_MANIFEST_ORPHAN');
    if (orphans.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[smoke] presets/frontend has ${orphans.length} pre-existing orphan(s): `
        + orphans.map((e) => e.path).join(', '),
      );
    }
  });
});
