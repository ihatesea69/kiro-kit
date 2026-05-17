/**
 * Unit test: Porter — fixture with 5 PortPlan covering conflict mix.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{design,tasks}.md
 * Task: tasks.md > 10.4 — "fixture với 5 PortPlan có conflict mix → assert
 *       đúng decision per file".
 *
 * Scenarios (per task brief):
 *   1. write-new          — target không tồn tại.
 *   2. no-op              — target tồn tại với content bằng source-rebranded.
 *   3. tier-1 kept-target — target dài > 1.5 × source lines.
 *   4. tier-3 sidecar     — chênh lệch < 20% dòng và source khác content.
 *   5. tier-4 kept-target — chênh lệch nhiều dòng nhưng không vượt Tier 1
 *                           threshold và không có YAML field mới (default
 *                           keep-target).
 *
 * Bonus assertions cho task 10.1, 10.2, 10.3:
 *   - Track portedFiles list per preset (10.2): after `port()`, `ported`
 *     contains entries chỉ cho decision ∈ {write-new, sidecar,
 *     merged-frontmatter, json-merged}; rollback có thể dùng `ported` để
 *     cleanup.
 *   - Skip malformed front-matter (10.3, edge 3.7): plan thứ 6 bonus với
 *     source `.md` malformed YAML → skipped + warning.
 *   - dryRun=true: decisions vẫn compute đúng, ported rỗng, không file ghi
 *     trên disk.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { port } = require('../../porter');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Tạo isolated tmp workspace với 2 thư mục con: `source/` và `target/`.
 * Caller có thể mkdir thêm subdirs theo nhu cầu fixture.
 *
 * @returns {{ root: string, sourceRoot: string, targetRoot: string }}
 */
function makeWorkspace() {
  const id = crypto.randomBytes(8).toString('hex');
  const root = path.join(os.tmpdir(), `parity-porter-${process.pid}-${id}`);
  fs.mkdirSync(root, { recursive: true });
  const sourceRoot = path.join(root, 'source');
  const targetRoot = path.join(root, 'target');
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  return { root, sourceRoot, targetRoot };
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Build content với N dòng, optional prefix tag. Trailing newline KHÔNG
 * thêm để countLines (per conflict-resolver) trả đúng N.
 *
 * @param {number} n
 * @param {string} prefix
 * @returns {string}
 */
function buildLines(n, prefix) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(`${prefix}-line-${i}`);
  return out.join('\n');
}

/**
 * Ghi file source dưới sourceRoot với POSIX-style relative path.
 *
 * @param {string} sourceRoot
 * @param {string} relPosix
 * @param {string} content
 */
function writeSource(sourceRoot, relPosix, content) {
  const abs = path.join(sourceRoot, ...relPosix.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

/**
 * Ghi file target. POSIX path (relative to workspace root cwd hierarchy).
 * Path `presets/<preset>/...` được join với `targetRoot`.
 *
 * @param {string} targetRoot
 * @param {string} targetPosix
 * @param {string} content
 */
function writeTarget(targetRoot, targetPosix, content) {
  const abs = path.join(targetRoot, ...targetPosix.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

/**
 * Đọc file target (POSIX rel) hoặc null nếu không tồn tại.
 *
 * @param {string} targetRoot
 * @param {string} targetPosix
 * @returns {string|null}
 */
function readTargetOrNull(targetRoot, targetPosix) {
  const abs = path.join(targetRoot, ...targetPosix.split('/'));
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Helper: build a minimal plan for a single file.
 *
 * @param {object} init
 * @returns {object}
 */
function buildPlan(init) {
  return {
    source_path: init.source_path,
    target_paths: init.target_paths,
    transforms: init.transforms || [],
    artifact_type: init.artifact_type || 'agent',
    target_preset: init.target_preset,
    source_id: init.source_id || `src.${init.source_path.replace(/[/.]/g, '_')}`,
  };
}

// ---------------------------------------------------------------------------
// Main scenario: 5 plans with conflict mix
// ---------------------------------------------------------------------------

describe('Porter — 5 PortPlan with conflict mix (task 10.4)', () => {
  /** @type {string} */
  let root;
  /** @type {string} */
  let sourceRoot;
  /** @type {string} */
  let targetRoot;

  beforeEach(() => {
    const ws = makeWorkspace();
    root = ws.root;
    sourceRoot = ws.sourceRoot;
    targetRoot = ws.targetRoot;
  });

  afterEach(() => {
    cleanupDir(root);
  });

  it('processes all 5 plans with correct decisions (write-new, no-op, tier-1, tier-3 sidecar, tier-4)', () => {
    // ----- Plan 1: write-new (target doesn't exist) -----
    // Source content has no rebrand-able tokens → output identical to source.
    writeSource(sourceRoot, 'agents/new-agent.md', '# New agent\n\nfresh content here.');
    const plan1 = buildPlan({
      source_path: 'agents/new-agent.md',
      target_paths: ['presets/frontend/agents/new-agent.md'],
      transforms: [],
      target_preset: 'frontend',
    });

    // ----- Plan 2: no-op (target byte-equal to source-rebranded) -----
    // Để rebrand idempotent (no Claude tokens), source = target = same content.
    const plan2Content = '# Stable agent\n\nNothing to rebrand here.';
    writeSource(sourceRoot, 'agents/stable.md', plan2Content);
    writeTarget(targetRoot, 'presets/frontend/agents/stable.md', plan2Content);
    const plan2 = buildPlan({
      source_path: 'agents/stable.md',
      target_paths: ['presets/frontend/agents/stable.md'],
      transforms: [],
      target_preset: 'frontend',
    });

    // ----- Plan 3: tier-1 kept-target (target_lines > 1.5 × source_lines) -----
    // Source 10 lines, target 30 lines, no overlap → tier 1 trigger
    // (30 > 1.5 × 10 = 15).
    const plan3Source = buildLines(10, 'src3');
    const plan3Target = buildLines(30, 'tgt3');
    writeSource(sourceRoot, 'agents/long-target.md', plan3Source);
    writeTarget(targetRoot, 'presets/frontend/agents/long-target.md', plan3Target);
    const plan3 = buildPlan({
      source_path: 'agents/long-target.md',
      target_paths: ['presets/frontend/agents/long-target.md'],
      transforms: [],
      target_preset: 'frontend',
    });

    // ----- Plan 4: tier-3 sidecar (small diff, no new YAML field) -----
    // Source 20 lines, target 19 lines → |1|/20 = 5% < 20% → tier 3.
    // Different content (different prefix) so hashes differ.
    const plan4Source = buildLines(20, 'src4');
    const plan4Target = buildLines(19, 'tgt4');
    writeSource(sourceRoot, 'commands/cmd.md', plan4Source);
    writeTarget(targetRoot, 'presets/frontend/commands/cmd.md', plan4Target);
    const plan4 = buildPlan({
      source_path: 'commands/cmd.md',
      target_paths: ['presets/frontend/commands/cmd.md'],
      transforms: [],
      artifact_type: 'command',
      target_preset: 'frontend',
    });

    // ----- Plan 5: tier-4 kept-target (default fallback) -----
    // Source 10 lines, target 12 lines → not tier 1 (12 < 15), no new YAML
    // field, |2|/12 ≈ 16.7% < 20% → would be tier 3.
    // Để đẩy về tier 4: tăng target_lines lên ngoài tier 3 nhưng dưới
    // tier 1 threshold. Target 13 lines, source 10 lines →
    //   tier 1: 13 > 15? no
    //   tier 2: no new YAML
    //   tier 3: |3|/13 ≈ 23% >= 20% → not tier 3
    //   → tier 4 default kept-target.
    const plan5Source = buildLines(10, 'src5');
    const plan5Target = buildLines(13, 'tgt5');
    writeSource(sourceRoot, 'commands/medium.md', plan5Source);
    writeTarget(targetRoot, 'presets/frontend/commands/medium.md', plan5Target);
    const plan5 = buildPlan({
      source_path: 'commands/medium.md',
      target_paths: ['presets/frontend/commands/medium.md'],
      transforms: [],
      artifact_type: 'command',
      target_preset: 'frontend',
    });

    // ----- Run Porter -----
    const result = port([plan1, plan2, plan3, plan4, plan5], {
      sourceRoot,
      targetRoot,
    });

    // ----- Decisions: each plan emits 1 decision (1 target_path each) -----
    expect(result.decisions).toHaveLength(5);

    /** @type {Record<string, string>} */
    const decisionByTarget = {};
    for (const d of result.decisions) {
      // Decisions return OS-native target_path; normalize for assertion via
      // posix relative.
      const rel = path.relative(targetRoot, d.target_path).split(path.sep).join('/');
      decisionByTarget[rel] = d.decision;
    }

    expect(decisionByTarget['presets/frontend/agents/new-agent.md']).toBe('write-new');
    expect(decisionByTarget['presets/frontend/agents/stable.md']).toBe('no-op');
    expect(decisionByTarget['presets/frontend/agents/long-target.md']).toBe('kept-target');
    expect(decisionByTarget['presets/frontend/commands/cmd.md']).toBe('sidecar');
    expect(decisionByTarget['presets/frontend/commands/medium.md']).toBe('kept-target');

    // Tier 1 vs Tier 4 distinguished by reason string.
    const tier1Decision = result.decisions.find((d) => d.target_path.endsWith('long-target.md'));
    const tier4Decision = result.decisions.find((d) => d.target_path.endsWith('medium.md'));
    expect(tier1Decision.reason).toContain('tier-1');
    expect(tier4Decision.reason).toContain('tier-4');

    // ----- Ported list (task 10.2 rollback tracking) -----
    // write-new → 1 entry; sidecar → 1 entry; total = 2 written.
    // no-op, kept-target ×2 → not tracked.
    expect(result.ported).toHaveLength(2);

    /** @type {Record<string, object>} */
    const portedByDecision = {};
    for (const p of result.ported) {
      portedByDecision[p.decision] = p;
    }
    expect(portedByDecision['write-new']).toBeDefined();
    expect(portedByDecision['write-new'].target_preset).toBe('frontend');
    expect(portedByDecision['write-new'].target_path).toBe(
      'presets/frontend/agents/new-agent.md',
    );
    expect(portedByDecision['sidecar']).toBeDefined();
    expect(portedByDecision['sidecar'].target_preset).toBe('frontend');
    // Sidecar tracking should record the actual sidecar file path
    // (with `.source.md` suffix), not the original target.
    expect(portedByDecision['sidecar'].target_path).toBe(
      'presets/frontend/commands/cmd.source.md',
    );

    // ----- Skipped/warnings empty in this scenario -----
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);

    // ----- Filesystem verification -----
    // 1. write-new: file created with source content.
    expect(readTargetOrNull(targetRoot, 'presets/frontend/agents/new-agent.md')).toBe(
      '# New agent\n\nfresh content here.',
    );
    // 2. no-op: file unchanged.
    expect(readTargetOrNull(targetRoot, 'presets/frontend/agents/stable.md')).toBe(
      plan2Content,
    );
    // 3. tier-1 kept-target: target unchanged.
    expect(readTargetOrNull(targetRoot, 'presets/frontend/agents/long-target.md')).toBe(
      plan3Target,
    );
    // 4. sidecar: original target unchanged + sidecar created with source.
    expect(readTargetOrNull(targetRoot, 'presets/frontend/commands/cmd.md')).toBe(
      plan4Target,
    );
    expect(readTargetOrNull(targetRoot, 'presets/frontend/commands/cmd.source.md')).toBe(
      plan4Source,
    );
    // 5. tier-4 kept-target: target unchanged + no sidecar.
    expect(readTargetOrNull(targetRoot, 'presets/frontend/commands/medium.md')).toBe(
      plan5Target,
    );
    expect(readTargetOrNull(targetRoot, 'presets/frontend/commands/medium.source.md')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge case: malformed front-matter (task 10.3, Req 3.7)
// ---------------------------------------------------------------------------

describe('Porter — skip malformed front-matter (task 10.3, edge 3.7)', () => {
  /** @type {string} */
  let root;
  /** @type {string} */
  let sourceRoot;
  /** @type {string} */
  let targetRoot;

  beforeEach(() => {
    const ws = makeWorkspace();
    root = ws.root;
    sourceRoot = ws.sourceRoot;
    targetRoot = ws.targetRoot;
  });

  afterEach(() => {
    cleanupDir(root);
  });

  it('skips .md source with malformed YAML and pushes warning', () => {
    // Malformed YAML: opens with `---`, has invalid syntax (mismatched indent
    // / unclosed quote).
    const malformed = '---\nname: "unclosed quote\ndescription: foo\n---\nbody';
    writeSource(sourceRoot, 'agents/bad.md', malformed);

    // Plan asks for frontmatter-keep transform → trigger E_FRONTMATTER skip.
    const plan = buildPlan({
      source_path: 'agents/bad.md',
      target_paths: ['presets/frontend/agents/bad.md'],
      transforms: ['rebrand', 'frontmatter-keep'],
      artifact_type: 'agent',
      target_preset: 'frontend',
    });

    const result = port([plan], { sourceRoot, targetRoot });

    expect(result.ported).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toEqual({
      source_path: 'agents/bad.md',
      target_preset: 'frontend',
      reason: 'malformed-front-matter',
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('E_FRONTMATTER');
    expect(result.warnings[0]).toContain('agents/bad.md');
    expect(result.warnings[0]).toContain('preset=frontend');

    // No file written.
    expect(readTargetOrNull(targetRoot, 'presets/frontend/agents/bad.md')).toBeNull();
  });

  it('plan without frontmatter-keep transform does NOT trigger malformed-FM skip', () => {
    // E.g., a plain .js file shouldn't be parsed as YAML.
    const malformedYaml = '---\nbroken: "unclosed\n---\nbody';
    writeSource(sourceRoot, 'hooks/x.js', malformedYaml);
    const plan = buildPlan({
      source_path: 'hooks/x.js',
      target_paths: ['presets/frontend/hooks/x.js'],
      transforms: ['rebrand'],
      artifact_type: 'hook',
      target_preset: 'frontend',
    });

    const result = port([plan], { sourceRoot, targetRoot });
    expect(result.skipped).toEqual([]);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].decision).toBe('write-new');
    expect(result.ported).toHaveLength(1);
  });

  it('records source-not-found when file is missing', () => {
    const plan = buildPlan({
      source_path: 'agents/missing.md',
      target_paths: ['presets/frontend/agents/missing.md'],
      transforms: [],
      target_preset: 'frontend',
    });
    const result = port([plan], { sourceRoot, targetRoot });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('source-not-found');
    expect(result.warnings[0]).toContain('source-not-found');
  });
});

// ---------------------------------------------------------------------------
// dryRun mode
// ---------------------------------------------------------------------------

describe('Porter — dryRun mode', () => {
  /** @type {string} */
  let root;
  /** @type {string} */
  let sourceRoot;
  /** @type {string} */
  let targetRoot;

  beforeEach(() => {
    const ws = makeWorkspace();
    root = ws.root;
    sourceRoot = ws.sourceRoot;
    targetRoot = ws.targetRoot;
  });

  afterEach(() => {
    cleanupDir(root);
  });

  it('computes decisions but does not write to disk; ported list stays empty', () => {
    writeSource(sourceRoot, 'agents/x.md', 'Hello\n');
    const plan = buildPlan({
      source_path: 'agents/x.md',
      target_paths: ['presets/frontend/agents/x.md'],
      transforms: [],
      target_preset: 'frontend',
    });

    const result = port([plan], { sourceRoot, targetRoot, dryRun: true });
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].decision).toBe('write-new');
    expect(result.ported).toEqual([]);
    expect(readTargetOrNull(targetRoot, 'presets/frontend/agents/x.md')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('Porter — input validation', () => {
  it('throws TypeError when plans is not an array', () => {
    expect(() => port(null, { sourceRoot: '/x' })).toThrow(TypeError);
    expect(() => port({}, { sourceRoot: '/x' })).toThrow(TypeError);
  });

  it('throws TypeError when options is missing or sourceRoot empty', () => {
    expect(() => port([], null)).toThrow(TypeError);
    expect(() => port([], {})).toThrow(TypeError);
    expect(() => port([], { sourceRoot: '' })).toThrow(TypeError);
  });

  it('returns empty result for empty plan list', () => {
    const result = port([], { sourceRoot: '/x' });
    expect(result).toEqual({
      ported: [],
      skipped: [],
      decisions: [],
      warnings: [],
    });
  });
});
