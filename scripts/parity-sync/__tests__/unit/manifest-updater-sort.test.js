/**
 * Unit test: ManifestUpdater sub-task 11.2 — sort entries theo `target`
 * ascending, serialize 2-space indent + trailing newline, atomic write
 * qua AtomicWriter.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{design,tasks}.md
 * Task: tasks.md > 11.2 — "Sort entries theo `target` ascending, atomic
 *       write qua AtomicWriter".
 *
 * Coverage map:
 *   - sortEntries: stable, ascending theo `target`, preserve schema
 *     (`files` vs `entries`), không reorder root fields.
 *   - serialize: 2-space indent, trailing LF newline, deterministic.
 *   - commit: pipeline sort → serialize → writeAtomic; ghi tmp tới tmp
 *     dir để không đụng presets/.
 *   - smoke: read presets/frontend/manifest.json, sort+commit ra tmp,
 *     verify JSON.parse + same entries (just sorted) + root fields
 *     preserved.
 *
 * Strategy: dùng REAL fs với `os.tmpdir()` cho commit/smoke (giống
 * pattern atomic-writer.test.js). Không mock vì commit là pure pipeline
 * + writeAtomic đã có test mock riêng.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  sortEntries,
  serialize,
  commit,
  compareByTarget,
  detectEntryListKey,
  JSON_INDENT,
  TRAILING_NEWLINE,
  update,
} = require('../../manifest-updater');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

function makeTmpDir() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(os.tmpdir(), `parity-sync-mu-test-${process.pid}-${id}`);
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

/** @returns {import('../../manifest-updater').Manifest} */
function fixtureManifestUnsorted() {
  return {
    name: 'frontend',
    version: '1.0.0',
    description: 'Test manifest',
    category: 'frontend',
    files: [
      { source: 'workflows/primary-workflow.md', target: '.kiro/workflows/primary-workflow.md', type: 'workflow' },
      { source: 'agents/scout.md', target: '.kiro/agents/scout.md', type: 'agent' },
      { source: 'agents/brainstormer.md', target: '.kiro/agents/brainstormer.md', type: 'agent' },
      { source: 'commands/git/cm.md', target: '.kiro/commands/git/cm.md', type: 'command' },
      { source: 'skills/aesthetic/SKILL.md', target: '.kiro/skills/aesthetic/SKILL.md', type: 'skill' },
      { source: 'agents/code-reviewer.md', target: '.kiro/agents/code-reviewer.md', type: 'agent' },
    ],
    minCounts: { agents: 16, skills: 28, commands: 40, hooks: 6, workflows: 4 },
    mcpServers: { fetch: { command: 'npx' } },
    hooks: { PreToolUse: ['scout-block'] },
    tags: ['react', 'frontend'],
  };
}

// ---------------------------------------------------------------------------
// compareByTarget
// ---------------------------------------------------------------------------

describe('compareByTarget', () => {
  it('returns -1 / 0 / 1 lexicographically by target', () => {
    expect(compareByTarget({ target: '.kiro/a' }, { target: '.kiro/b' })).toBe(-1);
    expect(compareByTarget({ target: '.kiro/b' }, { target: '.kiro/a' })).toBe(1);
    expect(compareByTarget({ target: '.kiro/a' }, { target: '.kiro/a' })).toBe(0);
  });

  it('treats missing target as empty string (sorted to front)', () => {
    expect(compareByTarget({ target: '' }, { target: '.kiro/a' })).toBe(-1);
    expect(
      compareByTarget(/** @type {any} */ ({}), { target: '.kiro/a' }),
    ).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// sortEntries
// ---------------------------------------------------------------------------

describe('sortEntries — orders entries ascending by target', () => {
  it('sorts files array ascending by target field', () => {
    const m = fixtureManifestUnsorted();
    sortEntries(m);

    const targets = m.files.map((e) => e.target);
    const sorted = [...targets].sort();
    expect(targets).toEqual(sorted);

    // Specific ordering check.
    expect(targets).toEqual([
      '.kiro/agents/brainstormer.md',
      '.kiro/agents/code-reviewer.md',
      '.kiro/agents/scout.md',
      '.kiro/commands/git/cm.md',
      '.kiro/skills/aesthetic/SKILL.md',
      '.kiro/workflows/primary-workflow.md',
    ]);
  });

  it('preserves all root fields and their order', () => {
    const m = fixtureManifestUnsorted();
    const rootKeysBefore = Object.keys(m);
    sortEntries(m);
    const rootKeysAfter = Object.keys(m);

    expect(rootKeysAfter).toEqual(rootKeysBefore);
    expect(m.name).toBe('frontend');
    expect(m.version).toBe('1.0.0');
    expect(m.category).toBe('frontend');
    expect(m.minCounts).toEqual({
      agents: 16, skills: 28, commands: 40, hooks: 6, workflows: 4,
    });
    expect(m.mcpServers).toEqual({ fetch: { command: 'npx' } });
    expect(m.hooks).toEqual({ PreToolUse: ['scout-block'] });
    expect(m.tags).toEqual(['react', 'frontend']);
  });

  it('mutates manifest in-place and returns same reference', () => {
    const m = fixtureManifestUnsorted();
    const ref = sortEntries(m);
    expect(ref).toBe(m);
  });

  it('is idempotent — sorting twice yields same result', () => {
    const m1 = fixtureManifestUnsorted();
    const m2 = fixtureManifestUnsorted();

    sortEntries(m1);
    sortEntries(m2);
    sortEntries(m2);

    expect(m1.files).toEqual(m2.files);
  });

  it('is stable — equal-target entries preserve original order', () => {
    // Construct edge case: two entries with same target (not realistic in
    // production but sort must be stable per ES2019+).
    const m = {
      name: 'test',
      files: [
        { source: 'a.md', target: '.kiro/x.md', type: 'doc', tag: 'first' },
        { source: 'b.md', target: '.kiro/x.md', type: 'doc', tag: 'second' },
        { source: 'c.md', target: '.kiro/aaa.md', type: 'doc' },
      ],
    };

    sortEntries(/** @type {any} */ (m));

    // .kiro/aaa.md comes first; the two .kiro/x.md keep input order.
    expect(m.files.map((e) => e.tag || null)).toEqual([null, 'first', 'second']);
  });

  it('handles empty files array (no-op)', () => {
    const m = { name: 'empty', files: [] };
    expect(() => sortEntries(/** @type {any} */ (m))).not.toThrow();
    expect(m.files).toEqual([]);
  });

  it('handles manifest without files key (creates empty)', () => {
    const m = { name: 'fresh' };
    sortEntries(/** @type {any} */ (m));
    expect(/** @type {any} */ (m).files).toEqual([]);
  });

  it('sorts `entries` key when manifest uses design.md schema', () => {
    // Forward-compat path: if a future manifest migrates `files` → `entries`,
    // sort still works.
    const m = {
      name: 'future',
      entries: [
        { source: 'b.md', target: '.kiro/b.md', type: 'doc' },
        { source: 'a.md', target: '.kiro/a.md', type: 'doc' },
      ],
    };

    sortEntries(/** @type {any} */ (m));

    expect(/** @type {any} */ (m).entries.map((e) => e.target)).toEqual([
      '.kiro/a.md',
      '.kiro/b.md',
    ]);
    // Did NOT migrate to `files` — schema preserved.
    expect(/** @type {any} */ (m).files).toBeUndefined();
  });

  it('throws TypeError for non-object input', () => {
    expect(() => sortEntries(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => sortEntries(/** @type {any} */ ('not an object'))).toThrow(
      TypeError,
    );
    expect(() => sortEntries(/** @type {any} */ (undefined))).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// serialize
// ---------------------------------------------------------------------------

describe('serialize — JSON 2-space indent + trailing LF newline', () => {
  it('uses 2-space indent', () => {
    expect(JSON_INDENT).toBe(2);

    const m = { name: 'x', files: [{ source: 'a', target: 'b', type: 'doc' }] };
    const out = serialize(/** @type {any} */ (m));
    // First indented line should have exactly 2 spaces before the key.
    expect(out).toMatch(/\n  "name":/);
  });

  it('appends LF trailing newline at EOF', () => {
    expect(TRAILING_NEWLINE).toBe('\n');
    const m = { name: 'x' };
    const out = serialize(/** @type {any} */ (m));
    expect(out.endsWith('\n')).toBe(true);
    // Exactly one trailing newline (not multiple).
    expect(out.endsWith('}\n')).toBe(true);
    expect(out.endsWith('}\n\n')).toBe(false);
  });

  it('produces deterministic output for same input', () => {
    const m1 = fixtureManifestUnsorted();
    const m2 = fixtureManifestUnsorted();
    sortEntries(m1);
    sortEntries(m2);
    expect(serialize(m1)).toBe(serialize(m2));
  });

  it('produces JSON that round-trips via JSON.parse', () => {
    const m = fixtureManifestUnsorted();
    sortEntries(m);
    const out = serialize(m);
    const parsed = JSON.parse(out);
    expect(parsed.name).toBe(m.name);
    expect(parsed.files).toEqual(m.files);
    expect(parsed.minCounts).toEqual(m.minCounts);
  });

  it('throws TypeError for non-object', () => {
    expect(() => serialize(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => serialize(/** @type {any} */ ('str'))).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// commit — full pipeline (sort → serialize → atomic write)
// ---------------------------------------------------------------------------

describe('commit — sort + atomic write via writeAtomic', () => {
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    cleanupDir(dir);
  });

  it('writes sorted manifest to manifestPath atomically', () => {
    const target = path.join(dir, 'manifest.json');
    const updateResult = {
      manifest: fixtureManifestUnsorted(),
      manifestPath: target,
      appended: [],
      skipped: [],
    };

    const stats = commit(updateResult);

    expect(stats.manifestPath).toBe(target);
    expect(fs.existsSync(target)).toBe(true);

    const raw = fs.readFileSync(target, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(stats.bytesWritten).toBe(Buffer.byteLength(raw, 'utf8'));

    const parsed = JSON.parse(raw);
    expect(parsed.files.map((/** @type {any} */ e) => e.target)).toEqual([
      '.kiro/agents/brainstormer.md',
      '.kiro/agents/code-reviewer.md',
      '.kiro/agents/scout.md',
      '.kiro/commands/git/cm.md',
      '.kiro/skills/aesthetic/SKILL.md',
      '.kiro/workflows/primary-workflow.md',
    ]);
  });

  it('honors manifestPathOverride for redirect (smoke test pattern)', () => {
    const original = path.join(dir, 'original.json');
    const override = path.join(dir, 'override.json');
    const updateResult = {
      manifest: fixtureManifestUnsorted(),
      manifestPath: original,
      appended: [],
      skipped: [],
    };

    commit(updateResult, { manifestPathOverride: override });

    expect(fs.existsSync(original)).toBe(false);
    expect(fs.existsSync(override)).toBe(true);
  });

  it('is idempotent — running commit twice yields byte-identical file', () => {
    const target = path.join(dir, 'manifest.json');

    commit({
      manifest: fixtureManifestUnsorted(),
      manifestPath: target,
      appended: [],
      skipped: [],
    });
    const firstBytes = fs.readFileSync(target);

    commit({
      manifest: fixtureManifestUnsorted(),
      manifestPath: target,
      appended: [],
      skipped: [],
    });
    const secondBytes = fs.readFileSync(target);

    expect(secondBytes.equals(firstBytes)).toBe(true);
  });

  it('throws TypeError for invalid updateResult shapes', () => {
    expect(() => commit(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => commit(/** @type {any} */ ({}))).toThrow(TypeError);
    expect(() =>
      commit(/** @type {any} */ ({ manifest: {}, manifestPath: '' })),
    ).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Smoke test against real preset manifest
// ---------------------------------------------------------------------------

describe('commit — smoke test on presets/frontend/manifest.json', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let workspaceRoot;

  beforeEach(() => {
    dir = makeTmpDir();
    // Resolve workspace root: this test file lives at
    // scripts/parity-sync/__tests__/unit/manifest-updater-sort.test.js
    // → workspace root is 4 levels up.
    workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
  });

  afterEach(() => {
    cleanupDir(dir);
  });

  it('reads presets/frontend/manifest.json, sorts, writes to tmp, preserves shape', () => {
    const sourcePath = path.join(workspaceRoot, 'presets', 'frontend', 'manifest.json');
    if (!fs.existsSync(sourcePath)) {
      // Defensive guard — this test is co-located with parity-sync; if the
      // monorepo layout shifts, fail loudly rather than skip silently.
      throw new Error(
        `Smoke test fixture missing: ${sourcePath}. Adjust workspaceRoot path.`,
      );
    }

    const originalRaw = fs.readFileSync(sourcePath, 'utf8');
    const originalParsed = JSON.parse(originalRaw);

    // Use the public `update` API to load + (no-op) append + serialize.
    const result = update('frontend', [], { workspaceRoot });

    // No append happened (portedFiles was empty).
    expect(result.appended).toEqual([]);

    // Redirect output to tmp dir to avoid touching real preset.
    const tmpTarget = path.join(dir, 'manifest.json');
    const stats = commit(result, { manifestPathOverride: tmpTarget });

    expect(stats.manifestPath).toBe(tmpTarget);
    expect(fs.existsSync(tmpTarget)).toBe(true);

    const writtenRaw = fs.readFileSync(tmpTarget, 'utf8');

    // Output is JSON-parseable.
    const writtenParsed = JSON.parse(writtenRaw);

    // Output ends with trailing newline.
    expect(writtenRaw.endsWith('\n')).toBe(true);

    // Same set of file entries as input (count + every source/target/type).
    const inputEntries = originalParsed.files;
    const outputEntries = writtenParsed.files;
    expect(outputEntries.length).toBe(inputEntries.length);

    const norm = (e) => `${e.source}::${e.target}::${e.type}::${e.executable ? '1' : '0'}`;
    expect(outputEntries.map(norm).sort()).toEqual(inputEntries.map(norm).sort());

    // Output entries are sorted ascending by target.
    const outputTargets = outputEntries.map((/** @type {any} */ e) => e.target);
    const sortedTargets = [...outputTargets].sort();
    expect(outputTargets).toEqual(sortedTargets);

    // Root fields preserved (name, version, description, category,
    // mcpServers, hooks, tags, minCounts).
    expect(writtenParsed.name).toBe(originalParsed.name);
    expect(writtenParsed.version).toBe(originalParsed.version);
    expect(writtenParsed.description).toBe(originalParsed.description);
    expect(writtenParsed.category).toBe(originalParsed.category);
    expect(writtenParsed.mcpServers).toEqual(originalParsed.mcpServers);
    expect(writtenParsed.hooks).toEqual(originalParsed.hooks);
    expect(writtenParsed.tags).toEqual(originalParsed.tags);
    expect(writtenParsed.minCounts).toEqual(originalParsed.minCounts);

    // Root key ORDER preserved — important for clean diffs.
    expect(Object.keys(writtenParsed)).toEqual(Object.keys(originalParsed));
  });
});
