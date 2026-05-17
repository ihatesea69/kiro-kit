/**
 * Unit test: AtomicWriter — happy path, mkdir auto, retry on lock,
 * copyFile fallback, error cleanup.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{design,tasks}.md
 * Task: tasks.md > 8.3 — "mock fs, simulate ENOENT/EACCES, verify retry
 *       behavior".
 *
 * Strategy (per task spec):
 *   - Happy-path tests dùng REAL fs với `os.tmpdir()`. Lý do: bảo đảm code
 *     thực sự ghi đúng nội dung lên disk; mock fs sẽ che mất bug encoding /
 *     mkdir behaviour.
 *   - Failure-simulation tests dùng `vi.spyOn(fs, ...)` để inject error
 *     codes (EBUSY, EPERM, EACCES, ENOENT). Spy được restore trong
 *     afterEach để không leak giữa các test.
 *   - Mỗi test tạo subdir random dưới `os.tmpdir()` để cô lập side-effects
 *     và cleanup hoàn toàn ở afterEach.
 *
 * Coverage map (task 8.3 brief):
 *   - "Happy path: write content to temp dir, verify file exists with
 *     correct content"           → describe('writeAtomic — happy path').
 *   - "Mkdir auto-created"        → describe('writeAtomic — auto mkdir').
 *   - "Retry on EBUSY"            → describe('writeAtomic — rename retry').
 *   - "Fallback on persistent rename failure" → describe('... — fallback').
 *   - "Cleanup on error"          → describe('... — cleanup on error').
 *
 * Bonus assertions:
 *   - Buffer content (binary) preserved.
 *   - String content written as UTF-8 (multibyte chars round-trip).
 *   - tmp file does NOT remain after success (renamed) or after fallback
 *     (unlinked).
 *   - Non-retryable errors (ENOENT) bubble up immediately without retry.
 *   - E_WRITE_LOCK code returned khi cả retry + fallback đều fail.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  writeAtomic,
  RENAME_MAX_ATTEMPTS,
} = require('../../atomic-writer');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Create an isolated tmp dir under `os.tmpdir()`. Returns OS-native abs path.
 *
 * @returns {string}
 */
function makeTmpDir() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(os.tmpdir(), `parity-sync-aw-test-${process.pid}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Recursively remove a directory (Node 14.14+ has fs.rmSync(recursive)).
 *
 * @param {string} dir
 */
function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort; tests don't fail on cleanup leak.
  }
}

/**
 * List filenames in `dir` (non-recursive). Returns [] if missing.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function listDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Build an `Error` with a Node-style `code` field.
 *
 * @param {string} code
 * @param {string} [message]
 * @returns {Error & { code: string }}
 */
function fsErr(code, message) {
  const e = new Error(message || code);
  /** @type {any} */ (e).code = code;
  return /** @type {any} */ (e);
}

// ---------------------------------------------------------------------------
// Happy path (real fs)
// ---------------------------------------------------------------------------

describe('writeAtomic — happy path (real fs)', () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    cleanupDir(dir);
  });

  it('writes a UTF-8 string to target path with exact bytes', () => {
    const target = path.join(dir, 'sample.md');
    const content = '# Hello\n\nKiroKit content with unicode: tiếng Việt 🚫.\n';

    writeAtomic(target, content);

    expect(fs.existsSync(target)).toBe(true);
    const round = fs.readFileSync(target, 'utf8');
    expect(round).toBe(content);
  });

  it('writes a Buffer (binary) without re-encoding', () => {
    const target = path.join(dir, 'binary.bin');
    // Bytes that would corrupt under UTF-8 round-trip if encoding were applied.
    const content = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x10, 0x42]);

    writeAtomic(target, content);

    const round = fs.readFileSync(target);
    expect(round.equals(content)).toBe(true);
  });

  it('overwrites an existing target atomically', () => {
    const target = path.join(dir, 'overwrite.md');
    fs.writeFileSync(target, 'OLD content', 'utf8');

    writeAtomic(target, 'NEW content');

    expect(fs.readFileSync(target, 'utf8')).toBe('NEW content');
  });

  it('does not leave any tmp.<pid>.<random> file after success', () => {
    const target = path.join(dir, 'no-leak.md');
    writeAtomic(target, 'data');

    const stragglers = listDir(dir).filter((name) =>
      name.startsWith('no-leak.md.tmp.'),
    );
    expect(stragglers).toEqual([]);
    expect(listDir(dir)).toEqual(['no-leak.md']);
  });

  it('writes empty string content as a zero-byte file', () => {
    const target = path.join(dir, 'empty.txt');
    writeAtomic(target, '');

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('');
    expect(fs.statSync(target).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mkdir auto-create
// ---------------------------------------------------------------------------

describe('writeAtomic — auto mkdir parent (real fs)', () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    cleanupDir(dir);
  });

  it('creates nested non-existent parent directories', () => {
    const target = path.join(
      dir,
      'level1',
      'level2',
      'level3',
      'deep.md',
    );
    // Verify pre-condition: nothing exists under `dir` yet.
    expect(listDir(dir)).toEqual([]);

    writeAtomic(target, 'deep payload');

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('deep payload');
  });

  it('does not error when parent dir already exists', () => {
    const sub = path.join(dir, 'existing');
    fs.mkdirSync(sub);
    const target = path.join(sub, 'file.md');

    expect(() => writeAtomic(target, 'x')).not.toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('x');
  });
});

// ---------------------------------------------------------------------------
// Rename retry behaviour (mocked fs)
// ---------------------------------------------------------------------------

describe('writeAtomic — rename retry on transient errors', () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupDir(dir);
  });

  it('succeeds on third rename attempt after two EBUSY errors', () => {
    const target = path.join(dir, 'busy-then-ok.md');
    const renameSpy = vi.spyOn(fs, 'renameSync');

    let calls = 0;
    renameSpy.mockImplementation((from, to) => {
      calls++;
      if (calls < 3) {
        throw fsErr('EBUSY', `simulated lock attempt ${calls}`);
      }
      // 3rd attempt: simulate a successful rename effect using copy + unlink
      // (calling fs.renameSync directly would re-enter the spy and loop).
      const buf = fs.readFileSync(/** @type {string} */ (from));
      fs.writeFileSync(/** @type {string} */ (to), buf);
      fs.unlinkSync(/** @type {string} */ (from));
    });

    writeAtomic(target, 'finally written');

    expect(calls).toBe(3);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('finally written');
  });

  it('retries on EPERM (Windows file-lock variant)', () => {
    const target = path.join(dir, 'eperm.md');
    const renameSpy = vi.spyOn(fs, 'renameSync');

    let calls = 0;
    renameSpy.mockImplementation((from, to) => {
      calls++;
      if (calls === 1) {
        throw fsErr('EPERM', 'simulated permission lock');
      }
      const buf = fs.readFileSync(/** @type {string} */ (from));
      fs.writeFileSync(/** @type {string} */ (to), buf);
      fs.unlinkSync(/** @type {string} */ (from));
    });

    writeAtomic(target, 'eperm body');

    expect(calls).toBe(2);
    expect(fs.readFileSync(target, 'utf8')).toBe('eperm body');
  });

  it('retries on EACCES', () => {
    const target = path.join(dir, 'eacces.md');
    const renameSpy = vi.spyOn(fs, 'renameSync');

    let calls = 0;
    renameSpy.mockImplementation((from, to) => {
      calls++;
      if (calls === 1) {
        throw fsErr('EACCES', 'simulated access denied');
      }
      const buf = fs.readFileSync(/** @type {string} */ (from));
      fs.writeFileSync(/** @type {string} */ (to), buf);
      fs.unlinkSync(/** @type {string} */ (from));
    });

    writeAtomic(target, 'eacces body');

    expect(calls).toBe(2);
    expect(fs.readFileSync(target, 'utf8')).toBe('eacces body');
  });

  it('does NOT retry on non-transient ENOENT (rethrows immediately)', () => {
    const target = path.join(dir, 'enoent.md');
    const renameSpy = vi.spyOn(fs, 'renameSync');
    renameSpy.mockImplementation(() => {
      throw fsErr('ENOENT', 'simulated missing tmp');
    });

    expect(() => writeAtomic(target, 'wont write')).toThrow(/ENOENT|missing/);

    // Spy invoked exactly once (no retry loop).
    expect(renameSpy).toHaveBeenCalledTimes(1);
    // Target not created.
    expect(fs.existsSync(target)).toBe(false);
    // Tmp cleaned up (no leftover .tmp files in dir).
    const stragglers = listDir(dir).filter((n) => n.includes('.tmp.'));
    expect(stragglers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fallback copyFile on persistent rename failure
// ---------------------------------------------------------------------------

describe('writeAtomic — fallback copyFile + unlink', () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupDir(dir);
  });

  it('falls back to copyFileSync + unlinkSync after RENAME_MAX_ATTEMPTS retryable failures', () => {
    const target = path.join(dir, 'fallback.md');
    const renameSpy = vi.spyOn(fs, 'renameSync');
    const copySpy = vi.spyOn(fs, 'copyFileSync');
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

    // Every rename attempt throws EBUSY → exhaust retry loop.
    renameSpy.mockImplementation(() => {
      throw fsErr('EBUSY', 'permanent lock');
    });

    // Let copy + unlink delegate to real fs by NOT providing impl override
    // (vi.spyOn defaults to passthrough when no mockImplementation set).

    writeAtomic(target, 'fallback body');

    expect(renameSpy).toHaveBeenCalledTimes(RENAME_MAX_ATTEMPTS);
    expect(copySpy).toHaveBeenCalledTimes(1);
    // unlinkSync called once for tmp cleanup (post-fallback).
    expect(unlinkSpy).toHaveBeenCalled();

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('fallback body');

    // No tmp file leaks.
    const stragglers = listDir(dir).filter((n) => n.includes('.tmp.'));
    expect(stragglers).toEqual([]);
  });

  it('throws E_WRITE_LOCK when both rename and copyFile persistently fail', () => {
    const target = path.join(dir, 'locked.md');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw fsErr('EBUSY', 'rename always fails');
    });
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw fsErr('EBUSY', 'copy also fails');
    });

    let caught = null;
    try {
      writeAtomic(target, 'doomed');
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(/** @type {any} */ (caught).code).toBe('E_WRITE_LOCK');
    expect(/** @type {any} */ (caught).message).toMatch(/locked\.md/);
    // cause field references the original error chain.
    expect(/** @type {any} */ (caught).cause).toBeDefined();

    // Target was never created.
    expect(fs.existsSync(target)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cleanup on write error
// ---------------------------------------------------------------------------

describe('writeAtomic — cleanup on error', () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupDir(dir);
  });

  it('does not leave a tmp file when writeFileSync itself fails', () => {
    const target = path.join(dir, 'write-fails.md');
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    writeSpy.mockImplementation(() => {
      throw fsErr('EACCES', 'simulated write denial');
    });

    expect(() => writeAtomic(target, 'x')).toThrow(/EACCES|denial/);

    // No target file created.
    expect(fs.existsSync(target)).toBe(false);
    // No tmp file leftover (write throw triggers cleanup; unlink of a never-
    // created tmp is a no-op via ENOENT handling).
    const stragglers = listDir(dir).filter((n) => n.includes('.tmp.'));
    expect(stragglers).toEqual([]);
  });

  it('cleans up tmp file when a non-retryable rename error occurs mid-flow', () => {
    // Create a real tmp via writeFileSync → fail rename with non-retryable
    // EISDIR (treated as non-retryable by atomic-writer).
    const target = path.join(dir, 'eisdir-target.md');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw fsErr('EISDIR', 'simulated dir conflict');
    });

    let caught = null;
    try {
      writeAtomic(target, 'wont survive');
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(/** @type {any} */ (caught).code).toBe('EISDIR');

    // No target created, no tmp leftover.
    expect(fs.existsSync(target)).toBe(false);
    const stragglers = listDir(dir).filter((n) => n.includes('.tmp.'));
    expect(stragglers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('writeAtomic — input validation', () => {
  it('throws TypeError when targetPath is not a string', () => {
    expect(() => writeAtomic(/** @type {any} */ (123), 'x')).toThrow(TypeError);
    expect(() => writeAtomic(/** @type {any} */ (null), 'x')).toThrow(TypeError);
    expect(() => writeAtomic(/** @type {any} */ (undefined), 'x')).toThrow(
      TypeError,
    );
  });

  it('throws TypeError when content is not string or Buffer', () => {
    const target = path.join(os.tmpdir(), 'never.md');
    expect(() => writeAtomic(target, /** @type {any} */ (42))).toThrow(TypeError);
    expect(() => writeAtomic(target, /** @type {any} */ ({}))).toThrow(TypeError);
    expect(() => writeAtomic(target, /** @type {any} */ (null))).toThrow(TypeError);
  });
});
