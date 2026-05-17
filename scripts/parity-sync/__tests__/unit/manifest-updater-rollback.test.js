/**
 * Unit test: ManifestUpdater sub-task 11.4 — `validateOrThrow` (throw
 * wrapper) + `rollbackPortedFiles` (best-effort delete helper).
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Task: tasks.md > 11.4 — "Throw E_MANIFEST_INVALID hoặc
 *       E_MANIFEST_NO_ORPHAN với rollback portedFiles nếu fail".
 *
 * Coverage map:
 *   - validateOrThrow: ok manifest → returns void, no throw.
 *   - validateOrThrow: broken-link → throws Error{ code: E_MANIFEST_INVALID }
 *     with errors[], portedFiles, preset fields.
 *   - validateOrThrow: orphan → throws Error{ code: E_MANIFEST_NO_ORPHAN }.
 *   - validateOrThrow: round-trip fail (undefined/NaN/circular) →
 *     throws Error{ code: E_MANIFEST_INVALID }.
 *   - validateOrThrow: aggregated message truncates to first 5 + "...and N more".
 *   - validateOrThrow: missing portedFiles option → defaults to [].
 *   - validateOrThrow: bubbles TypeError from validate input shape.
 *   - rollbackPortedFiles: deletes existing files, returns deleted count.
 *   - rollbackPortedFiles: swallows ENOENT, increments missing count.
 *   - rollbackPortedFiles: captures EACCES/EISDIR-style errors into
 *     `errors` array without throwing.
 *   - rollbackPortedFiles: empty / undefined input → no-op stats.
 *   - rollbackPortedFiles: rejects bad target_path (absolute / traversal)
 *     into errors.
 *   - rollbackPortedFiles: idempotent — second run with same list yields
 *     all-missing stats.
 *
 * Strategy: REAL fs với `os.tmpdir()` — same pattern như
 * manifest-updater-validate.test.js. Validate là pure function của
 * (manifest, fs state); rollbackPortedFiles là pure I/O. Không mock —
 * mock fs sẽ che đi platform-specific edge cases (Windows EBUSY, ...).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  validateOrThrow,
  rollbackPortedFiles,
  aggregateErrorMessages,
  ERROR_CODE_ALIASES,
  MAX_INLINE_ERRORS,
} = require('../../manifest-updater');

// ---------------------------------------------------------------------------
// Test utilities (cùng pattern manifest-updater-validate.test.js)
// ---------------------------------------------------------------------------

function makeTmpWorkspace() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(
    os.tmpdir(),
    `parity-sync-rollback-test-${process.pid}-${id}`,
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

/**
 * Tạo file với nội dung tùy ý dưới `<workspaceRoot>/<posixRelative>`.
 * Dùng cho test rollbackPortedFiles — không nhất thiết nằm trong
 * `presets/<preset>/`, vì Porter có thể track target_path ở `.kiro/...`
 * (workspace root) hoặc `presets/<preset>/...` (sidecar).
 *
 * @param {string} workspaceRoot
 * @param {string} posixRelative
 * @param {string} [content]
 */
function writeWorkspaceFile(workspaceRoot, posixRelative, content) {
  const osRel = posixRelative.split('/').join(path.sep);
  const full = path.join(workspaceRoot, osRel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content == null ? '' : content);
  return full;
}

// ===========================================================================
// validateOrThrow
// ===========================================================================

describe('validateOrThrow — ok manifest', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('returns undefined and does not throw when manifest is valid', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = {
      name: 'frontend',
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };
    const ret = validateOrThrow(manifest, {
      preset: 'frontend',
      workspaceRoot,
      portedFiles: [],
    });
    expect(ret).toBeUndefined();
  });

  it('accepts missing portedFiles option (defaults to empty)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = {
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };
    expect(() =>
      validateOrThrow(manifest, { preset: 'frontend', workspaceRoot })).not.toThrow();
  });
});

describe('validateOrThrow — broken-link case', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('throws Error with code E_MANIFEST_INVALID (broken-link aliased)', () => {
    // Per ERROR_CODE_ALIASES: BROKEN_LINK aliases to E_MANIFEST_INVALID
    // (design exit code 4 — both broken-link and round-trip fall under
    // "manifest invalid").
    expect(ERROR_CODE_ALIASES.E_MANIFEST_BROKEN_LINK).toBe('E_MANIFEST_INVALID');

    scaffoldPreset(workspaceRoot, 'frontend', []);
    const manifest = {
      files: [
        { source: 'agents/missing.md', target: '.kiro/agents/missing.md', type: 'agent' },
      ],
    };
    const portedFiles = [
      { target_path: 'presets/frontend/agents/missing.md', target_preset: 'frontend' },
    ];

    let caught;
    try {
      validateOrThrow(manifest, {
        preset: 'frontend',
        workspaceRoot,
        portedFiles,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('E_MANIFEST_INVALID');
    expect(caught.message).toContain('frontend');
    expect(caught.message).toContain('E_MANIFEST_BROKEN_LINK');
    expect(caught.preset).toBe('frontend');
    expect(Array.isArray(caught.errors)).toBe(true);
    expect(caught.errors).toHaveLength(1);
    expect(caught.errors[0].code).toBe('E_MANIFEST_BROKEN_LINK');
    expect(caught.errors[0].path).toBe('agents/missing.md');
    expect(caught.portedFiles).toBe(portedFiles); // pass-through reference.
  });
});

describe('validateOrThrow — orphan case', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('throws Error with code E_MANIFEST_NO_ORPHAN (design-aligned alias)', () => {
    expect(ERROR_CODE_ALIASES.E_MANIFEST_ORPHAN).toBe('E_MANIFEST_NO_ORPHAN');

    scaffoldPreset(workspaceRoot, 'frontend', [
      'agents/foo.md',
      'agents/orphan.md',
    ]);
    const manifest = {
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };
    const portedFiles = [
      { target_path: 'presets/frontend/agents/foo.md', target_preset: 'frontend' },
    ];

    let caught;
    try {
      validateOrThrow(manifest, {
        preset: 'frontend',
        workspaceRoot,
        portedFiles,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('E_MANIFEST_NO_ORPHAN');
    expect(caught.errors[0].code).toBe('E_MANIFEST_ORPHAN');
    expect(caught.errors[0].path).toBe('agents/orphan.md');
    expect(caught.portedFiles).toBe(portedFiles);
    expect(caught.preset).toBe('frontend');
  });
});

describe('validateOrThrow — round-trip failure', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('throws E_MANIFEST_INVALID for undefined value (round-trip drop)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    const manifest = /** @type {any} */ ({
      name: 'frontend',
      description: undefined,
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    });

    expect(() =>
      validateOrThrow(manifest, {
        preset: 'frontend',
        workspaceRoot,
        portedFiles: [],
      }))
      .toThrow(/E_MANIFEST_INVALID|non-serializable/i);
  });

  it('throws E_MANIFEST_INVALID for circular reference (stringify throws)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', ['agents/foo.md']);
    /** @type {any} */
    const manifest = {
      name: 'frontend',
      files: [
        { source: 'agents/foo.md', target: '.kiro/agents/foo.md', type: 'agent' },
      ],
    };
    manifest.self = manifest;

    let caught;
    try {
      validateOrThrow(manifest, {
        preset: 'frontend',
        workspaceRoot,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('E_MANIFEST_INVALID');
    expect(caught.errors).toHaveLength(1);
    expect(caught.errors[0].code).toBe('E_MANIFEST_INVALID');
  });
});

describe('validateOrThrow — error message truncation', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('truncates aggregated message to MAX_INLINE_ERRORS with "... and N more"', () => {
    expect(MAX_INLINE_ERRORS).toBe(5);

    // Create 7 broken-link entries → message should show first 5 + "...and 2 more".
    scaffoldPreset(workspaceRoot, 'frontend', []);
    const files = [];
    for (let i = 0; i < 7; i += 1) {
      files.push({
        source: `agents/missing-${i}.md`,
        target: `.kiro/agents/missing-${i}.md`,
        type: 'agent',
      });
    }
    const manifest = { files };

    let caught;
    try {
      validateOrThrow(manifest, { preset: 'frontend', workspaceRoot });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.errors).toHaveLength(7);
    expect(caught.message).toMatch(/and 2 more$/);
  });

  it('does not append "... and N more" when errors fit within limit', () => {
    scaffoldPreset(workspaceRoot, 'frontend', []);
    const manifest = {
      files: [
        { source: 'agents/missing-1.md', target: '.kiro/m1.md', type: 'agent' },
        { source: 'agents/missing-2.md', target: '.kiro/m2.md', type: 'agent' },
      ],
    };

    let caught;
    try {
      validateOrThrow(manifest, { preset: 'frontend', workspaceRoot });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).not.toMatch(/and \d+ more/);
  });
});

describe('validateOrThrow — input shape errors bubble', () => {
  it('bubbles TypeError when manifest is null', () => {
    expect(() =>
      validateOrThrow(/** @type {any} */ (null), { preset: 'frontend' })).toThrow(TypeError);
  });

  it('bubbles TypeError when preset is invalid', () => {
    expect(() =>
      validateOrThrow({}, { preset: 'unknown-preset' })).toThrow(TypeError);
  });
});

describe('validateOrThrow — defensive portedFiles coercion', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('attaches empty array when portedFiles is non-array (defensive)', () => {
    scaffoldPreset(workspaceRoot, 'frontend', []);
    const manifest = {
      files: [
        { source: 'agents/missing.md', target: '.kiro/m.md', type: 'agent' },
      ],
    };
    let caught;
    try {
      validateOrThrow(manifest, {
        preset: 'frontend',
        workspaceRoot,
        portedFiles: /** @type {any} */ ('not-an-array'),
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(Array.isArray(caught.portedFiles)).toBe(true);
    expect(caught.portedFiles).toHaveLength(0);
  });
});

// ===========================================================================
// aggregateErrorMessages — unit
// ===========================================================================

describe('aggregateErrorMessages — message formatting', () => {
  it('returns sentinel when input is empty', () => {
    expect(aggregateErrorMessages([])).toBe('(no validation errors)');
    expect(aggregateErrorMessages(/** @type {any} */ (null))).toBe('(no validation errors)');
  });

  it('formats each error as "[CODE] message" joined by "; "', () => {
    const out = aggregateErrorMessages([
      { code: 'E_MANIFEST_BROKEN_LINK', message: 'a missing' },
      { code: 'E_MANIFEST_ORPHAN', message: 'b orphan' },
    ]);
    expect(out).toBe('[E_MANIFEST_BROKEN_LINK] a missing; [E_MANIFEST_ORPHAN] b orphan');
  });

  it('truncates at MAX_INLINE_ERRORS (5) with " ... and N more" suffix', () => {
    const errs = Array.from({ length: 8 }, (_v, i) => ({
      code: 'E_MANIFEST_BROKEN_LINK',
      message: `err-${i}`,
    }));
    const out = aggregateErrorMessages(errs);
    expect(out.endsWith(' ... and 3 more')).toBe(true);
    expect(out.split(';')).toHaveLength(5);
  });

  it('handles malformed entry shapes defensively', () => {
    const out = aggregateErrorMessages(/** @type {any} */ ([
      {},
      { code: 'X' },
      { message: 'no code' },
    ]));
    expect(out).toContain('[UNKNOWN]');
    expect(out).toContain('[X]');
    expect(out).toContain('no code');
  });
});

// ===========================================================================
// rollbackPortedFiles
// ===========================================================================

describe('rollbackPortedFiles — input validation', () => {
  it('throws TypeError when options.workspaceRoot missing', () => {
    expect(() =>
      rollbackPortedFiles([], /** @type {any} */ ({}))).toThrow(TypeError);
    expect(() =>
      rollbackPortedFiles([], /** @type {any} */ (null))).toThrow(TypeError);
  });

  it('throws TypeError when workspaceRoot is empty string', () => {
    expect(() =>
      rollbackPortedFiles([], { workspaceRoot: '' })).toThrow(TypeError);
  });
});

describe('rollbackPortedFiles — empty / no-op cases', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('returns zero stats for empty array', () => {
    const stats = rollbackPortedFiles([], { workspaceRoot });
    expect(stats).toEqual({ deleted: 0, missing: 0, errors: [] });
  });

  it('returns zero stats for undefined input', () => {
    const stats = rollbackPortedFiles(/** @type {any} */ (undefined), { workspaceRoot });
    expect(stats).toEqual({ deleted: 0, missing: 0, errors: [] });
  });

  it('returns zero stats for non-array input (defensive)', () => {
    const stats = rollbackPortedFiles(/** @type {any} */ ('nope'), { workspaceRoot });
    expect(stats).toEqual({ deleted: 0, missing: 0, errors: [] });
  });

  it('skips items missing target_path silently', () => {
    writeWorkspaceFile(workspaceRoot, 'presets/frontend/agents/foo.md', 'x');
    const stats = rollbackPortedFiles([
      /** @type {any} */ ({}),
      /** @type {any} */ ({ target_path: '' }),
      /** @type {any} */ (null),
      { target_path: 'presets/frontend/agents/foo.md' },
    ], { workspaceRoot });
    expect(stats.deleted).toBe(1);
    expect(stats.missing).toBe(0);
    expect(stats.errors).toHaveLength(0);
  });
});

describe('rollbackPortedFiles — happy path', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('deletes existing files and returns deleted count', () => {
    const fA = writeWorkspaceFile(workspaceRoot, 'presets/frontend/agents/a.md', 'A');
    const fB = writeWorkspaceFile(workspaceRoot, 'presets/frontend/skills/b/SKILL.md', 'B');
    const fC = writeWorkspaceFile(workspaceRoot, '.kiro/agents/c.md', 'C');

    expect(fs.existsSync(fA)).toBe(true);
    expect(fs.existsSync(fB)).toBe(true);
    expect(fs.existsSync(fC)).toBe(true);

    const stats = rollbackPortedFiles([
      { target_path: 'presets/frontend/agents/a.md', target_preset: 'frontend' },
      { target_path: 'presets/frontend/skills/b/SKILL.md', target_preset: 'frontend' },
      { target_path: '.kiro/agents/c.md', target_preset: 'frontend' },
    ], { workspaceRoot });

    expect(stats).toEqual({ deleted: 3, missing: 0, errors: [] });
    expect(fs.existsSync(fA)).toBe(false);
    expect(fs.existsSync(fB)).toBe(false);
    expect(fs.existsSync(fC)).toBe(false);
  });
});

describe('rollbackPortedFiles — ENOENT swallowing', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('counts missing files into `missing` and continues', () => {
    writeWorkspaceFile(workspaceRoot, 'presets/frontend/agents/a.md', 'A');

    const stats = rollbackPortedFiles([
      { target_path: 'presets/frontend/agents/a.md', target_preset: 'frontend' },
      { target_path: 'presets/frontend/agents/missing-1.md', target_preset: 'frontend' },
      { target_path: 'presets/frontend/agents/missing-2.md', target_preset: 'frontend' },
    ], { workspaceRoot });

    expect(stats.deleted).toBe(1);
    expect(stats.missing).toBe(2);
    expect(stats.errors).toEqual([]);
  });

  it('is idempotent: second call with same list reports all-missing', () => {
    writeWorkspaceFile(workspaceRoot, 'presets/frontend/agents/a.md', 'A');
    const list = [
      { target_path: 'presets/frontend/agents/a.md', target_preset: 'frontend' },
    ];
    const first = rollbackPortedFiles(list, { workspaceRoot });
    expect(first).toEqual({ deleted: 1, missing: 0, errors: [] });
    const second = rollbackPortedFiles(list, { workspaceRoot });
    expect(second).toEqual({ deleted: 0, missing: 1, errors: [] });
  });
});

describe('rollbackPortedFiles — rejects bad paths into errors', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('captures absolute-path target_path into errors (toOsPath rejects)', () => {
    const stats = rollbackPortedFiles([
      // Absolute path triggers normalizeRelPath rejection.
      { target_path: '/etc/passwd' },
    ], { workspaceRoot });
    expect(stats.deleted).toBe(0);
    expect(stats.missing).toBe(0);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].path).toBe('/etc/passwd');
    expect(stats.errors[0].error).toBeInstanceOf(Error);
  });

  it('captures traversal target_path into errors', () => {
    const stats = rollbackPortedFiles([
      { target_path: '../../etc/passwd' },
    ], { workspaceRoot });
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].path).toBe('../../etc/passwd');
  });
});

describe('rollbackPortedFiles — captures non-ENOENT errors without throwing', () => {
  /** @type {string} */
  let workspaceRoot;
  beforeEach(() => { workspaceRoot = makeTmpWorkspace(); });
  afterEach(() => { cleanupDir(workspaceRoot); });

  it('does not throw when target_path is a directory (EISDIR/EPERM-style)', () => {
    // Create a directory at the path that the rollback list points to.
    const dirPath = path.join(workspaceRoot, 'presets', 'frontend', 'agents');
    fs.mkdirSync(dirPath, { recursive: true });
    // Verify directory exists.
    expect(fs.statSync(dirPath).isDirectory()).toBe(true);

    let stats;
    expect(() => {
      stats = rollbackPortedFiles([
        { target_path: 'presets/frontend/agents' },
      ], { workspaceRoot });
    }).not.toThrow();

    // unlinkSync on a directory throws EPERM (Win) or EISDIR (Linux/macOS)
    // — either way it should be captured into errors, never re-thrown.
    expect(stats.deleted).toBe(0);
    expect(stats.missing + stats.errors.length).toBe(1);
    if (stats.errors.length === 1) {
      expect(stats.errors[0].path).toBe('presets/frontend/agents');
      expect(stats.errors[0].error).toBeInstanceOf(Error);
    }
  });
});
