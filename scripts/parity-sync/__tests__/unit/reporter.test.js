/**
 * Unit tests: Reporter — render delta-report.md, conflict-log.md,
 * parity-sync-report.md; Property 11 final check (no emoji + no PII);
 * idempotency snapshot equality.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Tasks: tasks.md > 12.1, 12.2, 12.3, 12.4, 12.5
 *
 * Strategy:
 *
 *   1. **Deterministic snapshot fixtures (task 12.5).** Build 3 fixed
 *      input shapes (`buildDeltaFixture`, `buildDecisionsFixture`,
 *      `buildRunResultFixture`) — KHÔNG có random, KHÔNG có timestamp
 *      bị Reporter sinh nội bộ (timestamps đều caller-supplied static
 *      ISO 8601 strings). Render output should be byte-stable.
 *
 *   2. **Snapshot equality (idempotency check, Property 10).** Render
 *      ngay sau nhau hai lần → expect same string output. Đây là proxy
 *      cho "git diff trống ở lần chạy thứ hai".
 *
 *   3. **Format assertions.** Mỗi report check:
 *        - Title line.
 *        - Có table summary / front-matter / heading.
 *        - Counts khớp với fixture input (tránh off-by-one).
 *        - Sort ổn định (sort lại cùng input vẫn cho output bằng).
 *
 *   4. **Property 11 (task 12.4).** `assertNoEmojiNoPII`:
 *        - Pass clean content (không emoji/email/phone).
 *        - Reject emoji (U+2600 ✓, U+1F4E2 emoji speaker, ...).
 *        - Reject email RFC-5322 simplified (`alice@example.com`).
 *        - Reject phone E.164 (`+12025551234`).
 *
 *   5. **`writeReports` orchestration.** Use real fs với tmp dir; assert
 *        ba file tồn tại với nội dung đúng + idempotent (write hai lần
 *        cho ra cùng bytes).
 *
 * Fixtures được build với fixed timestamp `2026-01-15T03:04:05Z` để output
 * deterministic (Property 10).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const reporter = require('../../reporter');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

function makeTmpDir() {
  const id = crypto.randomBytes(6).toString('hex');
  const dir = path.join(os.tmpdir(), `parity-reporter-${process.pid}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

const FIXED_TIMESTAMP = '2026-01-15T03:04:05Z';
const FIXED_HASH_A = 'a'.repeat(64);
const FIXED_HASH_B = 'b'.repeat(64);
const FIXED_HASH_C = 'c'.repeat(64);

// ---------------------------------------------------------------------------
// Fixture builders (task 12.5)
// ---------------------------------------------------------------------------

/**
 * Build a deterministic DeltaEntry[] covering all 4 statuses across 2
 * presets. Order intentionally scrambled to test sort.
 */
function buildDeltaFixture() {
  return [
    // Scrambled order — Reporter must sort by (preset, source_path).
    {
      source_id: 'src.skill.payment-integration',
      source_path: 'skills/payment-integration/SKILL.md',
      target_preset: 'frontend',
      target_path: 'presets/frontend/skills/payment-integration/SKILL.md',
      status: 'category-skip',
      reason: 'backend+fullstack-only',
      source_lines: 50,
    },
    {
      source_id: 'src.agent.brainstormer',
      source_path: 'agents/brainstormer.md',
      target_preset: 'frontend',
      target_path: 'presets/frontend/agents/brainstormer.md',
      status: 'missing',
      source_lines: 101,
    },
    {
      source_id: 'src.skill.aesthetic',
      source_path: 'skills/aesthetic/SKILL.md',
      target_preset: 'frontend',
      target_path: 'presets/frontend/skills/aesthetic/SKILL.md',
      status: 'partial',
      reason: 'missing-subdir-references',
      source_lines: 80,
    },
    {
      source_id: 'src.agent.brainstormer',
      source_path: 'agents/brainstormer.md',
      target_preset: 'backend',
      target_path: 'presets/backend/agents/brainstormer.md',
      status: 'present',
      source_lines: 101,
      target_lines: 101,
    },
  ];
}

/**
 * Build a deterministic ConflictDecision[] covering 3 decisions + 1 no-op
 * (which must be filtered out of conflict-log).
 */
function buildDecisionsFixture() {
  return [
    {
      target_path: 'presets/frontend/agents/code-reviewer.md',
      decision: 'kept-target',
      reason: 'tier-1: target_lines (164) > 1.5 × source_lines (98)',
      source_hash: FIXED_HASH_A,
      target_hash: FIXED_HASH_B,
      timestamp: FIXED_TIMESTAMP,
    },
    {
      target_path: 'presets/frontend/skills/aesthetic/SKILL.md',
      decision: 'sidecar',
      reason: 'tier-3: |target_lines (50) − source_lines (48)| / max < 0.2',
      source_hash: FIXED_HASH_C,
      target_hash: FIXED_HASH_A,
      sidecar_path: 'presets/frontend/skills/aesthetic/SKILL.source.md',
      timestamp: FIXED_TIMESTAMP,
    },
    {
      target_path: 'presets/backend/settings.json',
      decision: 'json-merged',
      reason: 'json-deep-merge: keep target keys, add source-only keys',
      source_hash: FIXED_HASH_A,
      target_hash: FIXED_HASH_B,
      timestamp: FIXED_TIMESTAMP,
    },
    {
      // no-op should be filtered out.
      target_path: 'presets/backend/agents/scout.md',
      decision: 'no-op',
      reason: 'source-and-target-byte-equal',
      source_hash: FIXED_HASH_A,
      target_hash: FIXED_HASH_A,
      timestamp: FIXED_TIMESTAMP,
    },
  ];
}

/**
 * Build a deterministic ParityRunResult covering totals + per-preset
 * before/after + manual review.
 */
function buildRunResultFixture() {
  return {
    ranAt: FIXED_TIMESTAMP,
    presets: ['frontend', 'backend'],
    totals: {
      ported: 42,
      skipped: 5,
      conflicts: 3,
      manualReviewPending: 2,
    },
    perPreset: {
      frontend: {
        before: { agents: 12, skills: 20, commands: 25, hooks: 6, workflows: 4 },
        after: { agents: 16, skills: 28, commands: 40, hooks: 6, workflows: 4 },
      },
      backend: {
        before: { agents: 12, skills: 20, commands: 25, hooks: 6, workflows: 4 },
        after: { agents: 16, skills: 28, commands: 49, hooks: 6, workflows: 4 },
      },
      fullstack: {
        before: { agents: 12, skills: 20, commands: 25, hooks: 6, workflows: 4 },
        after: { agents: 16, skills: 28, commands: 55, hooks: 6, workflows: 4 },
      },
      mobile: {
        before: { agents: 12, skills: 20, commands: 25, hooks: 6, workflows: 4 },
        after: { agents: 16, skills: 28, commands: 53, hooks: 6, workflows: 4 },
      },
      devops: {
        before: { agents: 12, skills: 20, commands: 25, hooks: 6, workflows: 4 },
        after: { agents: 16, skills: 28, commands: 47, hooks: 6, workflows: 4 },
      },
      'data-ai': {
        before: { agents: 12, skills: 20, commands: 25, hooks: 6, workflows: 4 },
        after: { agents: 16, skills: 32, commands: 47, hooks: 6, workflows: 4 },
      },
    },
    // Intentionally unsorted for test of sort.
    manualReview: [
      'presets/frontend/skills/aesthetic/SKILL.source.md',
      'presets/backend/agents/code-reviewer.source.md',
    ],
  };
}

// ---------------------------------------------------------------------------
// renderDeltaReport (task 12.1)
// ---------------------------------------------------------------------------

describe('renderDeltaReport (task 12.1)', () => {
  it('returns markdown string with title + Summary + Details sections', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^# the upstream kit Parity Sync — Delta Report\n/);
    expect(out).toContain('## Summary');
    expect(out).toContain('## Details');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('Summary table has correct counts per preset (4 statuses)', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());
    // frontend: missing=1, partial=1, category-skip=1, present=0
    expect(out).toContain('| frontend | 1 | 1 | 1 | 0 |');
    // backend: missing=0, partial=0, category-skip=0, present=1
    expect(out).toContain('| backend | 0 | 0 | 0 | 1 |');
    // fullstack/mobile/devops/data-ai/_template all 0/0/0/0 (still rendered)
    expect(out).toContain('| fullstack | 0 | 0 | 0 | 0 |');
    expect(out).toContain('| _template | 0 | 0 | 0 | 0 |');
  });

  it('Details section lists each entry sorted by (preset, source_path)', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());

    // Frontend section comes BEFORE backend in PRESET_ORDER.
    const frontendIdx = out.indexOf('### frontend');
    const backendIdx = out.indexOf('### backend');
    expect(frontendIdx).toBeGreaterThanOrEqual(0);
    expect(backendIdx).toBeGreaterThan(frontendIdx);

    // Within frontend: agents/brainstormer < skills/aesthetic < skills/payment-integration
    const fSection = out.slice(frontendIdx, backendIdx);
    const agentIdx = fSection.indexOf('agents/brainstormer.md');
    const aestheticIdx = fSection.indexOf('skills/aesthetic/SKILL.md');
    const paymentIdx = fSection.indexOf('skills/payment-integration/SKILL.md');
    expect(agentIdx).toBeGreaterThan(0);
    expect(aestheticIdx).toBeGreaterThan(agentIdx);
    expect(paymentIdx).toBeGreaterThan(aestheticIdx);
  });

  it('formats missing entries with size_lines + arrow', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());
    expect(out).toContain(
      '- [missing] agents/brainstormer.md (size_lines=101) -> presets/frontend/agents/brainstormer.md',
    );
  });

  it('formats partial entries with human-readable subdir reason', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());
    expect(out).toContain(
      '- [partial] skills/aesthetic/SKILL.md (missing references/) -> presets/frontend/skills/aesthetic/SKILL.md',
    );
  });

  it('formats category-skip entries with reason but NO arrow target path', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());
    expect(out).toContain(
      '- [category-skip] skills/payment-integration/SKILL.md (reason: backend+fullstack-only)',
    );
    // No arrow on category-skip line.
    const line = out.split('\n').find((l) => l.includes('payment-integration'));
    expect(line).toBeDefined();
    expect(line.includes(' -> ')).toBe(false);
  });

  it('renders empty preset section with "(no entries)" placeholder', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());
    expect(out).toContain('### fullstack\n\n- (no entries)');
  });

  it('is idempotent — same input twice produces byte-equal output (Property 10)', () => {
    const a = reporter.renderDeltaReport(buildDeltaFixture());
    const b = reporter.renderDeltaReport(buildDeltaFixture());
    expect(a).toBe(b);
  });

  it('does NOT contain ISO timestamp anywhere (Req 15.2)', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());
    // Reject any ISO 8601 timestamp pattern (year-month-day with T separator).
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('input array is not mutated (defensive copy)', () => {
    const input = buildDeltaFixture();
    const before = JSON.stringify(input);
    reporter.renderDeltaReport(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('throws TypeError for non-array input', () => {
    expect(() => reporter.renderDeltaReport(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => reporter.renderDeltaReport(/** @type {any} */ ({}))).toThrow(TypeError);
  });

  it('handles empty deltas — still renders summary + per-preset (no entries)', () => {
    const out = reporter.renderDeltaReport([]);
    expect(out).toContain('## Summary');
    expect(out).toContain('| frontend | 0 | 0 | 0 | 0 |');
    expect(out).toContain('### frontend\n\n- (no entries)');
  });
});

// ---------------------------------------------------------------------------
// renderConflictLog (task 12.2)
// ---------------------------------------------------------------------------

describe('renderConflictLog (task 12.2)', () => {
  it('returns markdown with title + entry per loggable decision', () => {
    const out = reporter.renderConflictLog(buildDecisionsFixture());
    expect(out).toMatch(/^# the upstream kit Parity Sync — Conflict Log\n/);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('filters out no-op decisions (hash-equal entries)', () => {
    const out = reporter.renderConflictLog(buildDecisionsFixture());
    // The no-op decision target is presets/backend/agents/scout.md.
    expect(out).not.toContain('backend/agents/scout.md');
    expect(out).not.toContain('no-op');
  });

  it('strips presets/ prefix from heading', () => {
    const out = reporter.renderConflictLog(buildDecisionsFixture());
    expect(out).toContain('## frontend/agents/code-reviewer.md');
    expect(out).toContain('## backend/settings.json');
    expect(out).not.toMatch(/^## presets\//m);
  });

  it('renders all required fields per entry', () => {
    const out = reporter.renderConflictLog(buildDecisionsFixture());
    expect(out).toContain('- decision: kept-target');
    expect(out).toContain('- reason: tier-1: target_lines (164) > 1.5 × source_lines (98)');
    expect(out).toContain(`- source_hash: ${FIXED_HASH_A}`);
    expect(out).toContain(`- target_hash: ${FIXED_HASH_B}`);
    expect(out).toContain(`- timestamp: ${FIXED_TIMESTAMP}`);
  });

  it('includes sidecar_path field for sidecar decisions', () => {
    const out = reporter.renderConflictLog(buildDecisionsFixture());
    expect(out).toContain('- sidecar_path: frontend/skills/aesthetic/SKILL.source.md');
  });

  it('renders json-merged decision', () => {
    const out = reporter.renderConflictLog(buildDecisionsFixture());
    expect(out).toContain('## backend/settings.json');
    expect(out).toContain('- decision: json-merged');
  });

  it('sorts entries by target_path ascending', () => {
    const out = reporter.renderConflictLog(buildDecisionsFixture());
    const codeReviewerIdx = out.indexOf('## frontend/agents/code-reviewer.md');
    const aestheticIdx = out.indexOf('## frontend/skills/aesthetic/SKILL.md');
    const settingsIdx = out.indexOf('## backend/settings.json');
    // Sorted by full target_path:
    //   presets/backend/settings.json
    //   presets/frontend/agents/code-reviewer.md
    //   presets/frontend/skills/aesthetic/SKILL.md
    expect(settingsIdx).toBeGreaterThanOrEqual(0);
    expect(settingsIdx).toBeLessThan(codeReviewerIdx);
    expect(codeReviewerIdx).toBeLessThan(aestheticIdx);
  });

  it('handles target_hash null (write-new decisions)', () => {
    const decisions = [{
      target_path: 'presets/frontend/agents/new-agent.md',
      decision: 'write-new',
      reason: 'target-does-not-exist',
      source_hash: FIXED_HASH_A,
      target_hash: null,
      timestamp: FIXED_TIMESTAMP,
    }];
    const out = reporter.renderConflictLog(decisions);
    expect(out).toContain('- target_hash: null');
  });

  it('renders "(no conflicts logged)" when input is empty', () => {
    const out = reporter.renderConflictLog([]);
    expect(out).toContain('# the upstream kit Parity Sync — Conflict Log');
    expect(out).toContain('(no conflicts logged)');
  });

  it('is idempotent for fixed input (Property 10)', () => {
    const a = reporter.renderConflictLog(buildDecisionsFixture());
    const b = reporter.renderConflictLog(buildDecisionsFixture());
    expect(a).toBe(b);
  });

  it('throws TypeError for non-array input', () => {
    expect(() => reporter.renderConflictLog(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => reporter.renderConflictLog(/** @type {any} */ ('foo'))).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// renderParitySyncReport (task 12.3)
// ---------------------------------------------------------------------------

describe('renderParitySyncReport (task 12.3)', () => {
  it('starts with YAML front-matter containing timestamp + ranAt', () => {
    const out = reporter.renderParitySyncReport(buildRunResultFixture());
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toMatch(/^---\ntimestamp: 2026-01-15T03:04:05Z\nranAt: 2026-01-15T03:04:05Z\n---\n/);
  });

  it('renders Totals section with ported/skipped/conflicts/manualReviewPending', () => {
    const out = reporter.renderParitySyncReport(buildRunResultFixture());
    expect(out).toContain('## Totals');
    expect(out).toContain('- Files ported: 42');
    expect(out).toContain('- Files skipped: 5');
    expect(out).toContain('- Conflicts resolved: 3');
    expect(out).toContain('- Manual review pending: 2');
  });

  it('renders Per-Preset Counts table with B/A format', () => {
    const out = reporter.renderParitySyncReport(buildRunResultFixture());
    expect(out).toContain('## Per-Preset Counts (Before vs After)');
    expect(out).toContain('| frontend | 12/16 | 20/28 | 25/40 | 6/6 | 4/4 |');
    expect(out).toContain('| backend | 12/16 | 20/28 | 25/49 | 6/6 | 4/4 |');
    expect(out).toContain('| data-ai | 12/16 | 20/32 | 25/47 | 6/6 | 4/4 |');
  });

  it('excludes _template from per-preset table (skeleton, not user-facing)', () => {
    const out = reporter.renderParitySyncReport(buildRunResultFixture());
    // _template should NOT appear in per-preset rows.
    const lines = out.split('\n');
    const tableLines = lines.filter((l) => l.startsWith('| ') && l.includes('/'));
    // Filter "B/A" header row out by expecting no `_template ` cell.
    expect(tableLines.some((l) => l.includes('_template'))).toBe(false);
  });

  it('renders Manual Review Pending section sorted ascending', () => {
    const out = reporter.renderParitySyncReport(buildRunResultFixture());
    expect(out).toContain('## Manual Review Pending (top 20)');
    const backendIdx = out.indexOf('presets/backend/agents/code-reviewer.source.md');
    const frontendIdx = out.indexOf('presets/frontend/skills/aesthetic/SKILL.source.md');
    expect(backendIdx).toBeGreaterThan(0);
    expect(frontendIdx).toBeGreaterThan(backendIdx);
  });

  it('limits manual review to top 20 entries', () => {
    const fixture = buildRunResultFixture();
    fixture.manualReview = [];
    for (let i = 0; i < 50; i++) {
      fixture.manualReview.push(`presets/frontend/agents/agent-${String(i).padStart(2, '0')}.source.md`);
    }
    const out = reporter.renderParitySyncReport(fixture);
    // Count list bullet items in manual review section.
    const sectionStart = out.indexOf('## Manual Review Pending (top 20)');
    const section = out.slice(sectionStart);
    const bulletCount = (section.match(/^- /gm) || []).length;
    expect(bulletCount).toBe(20);
  });

  it('renders "(none)" when manual review is empty', () => {
    const fixture = buildRunResultFixture();
    fixture.manualReview = [];
    const out = reporter.renderParitySyncReport(fixture);
    expect(out).toContain('## Manual Review Pending (top 20)\n\n- (none)');
  });

  it('is idempotent for fixed input (Property 10)', () => {
    const a = reporter.renderParitySyncReport(buildRunResultFixture());
    const b = reporter.renderParitySyncReport(buildRunResultFixture());
    expect(a).toBe(b);
  });

  it('throws TypeError when ranAt is missing or not a string', () => {
    expect(() => reporter.renderParitySyncReport(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => reporter.renderParitySyncReport(/** @type {any} */ ({}))).toThrow(TypeError);
    expect(() => reporter.renderParitySyncReport(/** @type {any} */ ({ ranAt: '' }))).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// assertNoEmojiNoPII (task 12.4 — Property 11 final check)
// ---------------------------------------------------------------------------

describe('assertNoEmojiNoPII (task 12.4)', () => {
  it('passes for clean ASCII content', () => {
    expect(() => reporter.assertNoEmojiNoPII('# Title\n\n- bullet a\n- bullet b\n')).not.toThrow();
  });

  it('passes for content with hash hex strings (not PII)', () => {
    const c = '- source_hash: ' + 'a'.repeat(64) + '\n';
    expect(() => reporter.assertNoEmojiNoPII(c)).not.toThrow();
  });

  it('passes for ISO 8601 timestamp (not PII)', () => {
    expect(() => reporter.assertNoEmojiNoPII('2026-01-15T03:04:05Z\n')).not.toThrow();
  });

  it('rejects content containing emoji from misc symbols range (U+2600-U+27BF)', () => {
    expect(() => reporter.assertNoEmojiNoPII('Status: \u2705 done')).toThrow(/Emoji detected/);
  });

  it('rejects content containing emoji from extended pictographs (U+1F300-U+1FAFF)', () => {
    // U+1F4E2 = LOUDSPEAKER (📢).
    expect(() => reporter.assertNoEmojiNoPII('Notice \uD83D\uDCE2 alert')).toThrow(/Emoji detected/);
  });

  it('rejects content with email PII (RFC-5322 simplified)', () => {
    expect(() => reporter.assertNoEmojiNoPII('Contact alice@example.com for details')).toThrow(/email/);
  });

  it('rejects content with phone E.164 PII', () => {
    expect(() => reporter.assertNoEmojiNoPII('Call +12025551234 for support')).toThrow(/phone/);
  });

  it('attaches code, kind, position fields to thrown error', () => {
    try {
      reporter.assertNoEmojiNoPII('Hello \u2705 world');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('E_REPORTER_EMOJI_OR_PII');
      expect(err.kind).toBe('emoji');
      expect(typeof err.position).toBe('number');
    }
  });

  it('uses opts.label in error message', () => {
    try {
      reporter.assertNoEmojiNoPII('Email: bob@test.com', { label: 'delta-report.md' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.message).toContain('delta-report.md');
    }
  });

  it('throws TypeError for non-string content', () => {
    expect(() => reporter.assertNoEmojiNoPII(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => reporter.assertNoEmojiNoPII(/** @type {any} */ (123))).toThrow(TypeError);
  });

  it('all three rendered reports pass Property 11 check', () => {
    const delta = reporter.renderDeltaReport(buildDeltaFixture());
    const conflict = reporter.renderConflictLog(buildDecisionsFixture());
    const run = reporter.renderParitySyncReport(buildRunResultFixture());
    expect(() => reporter.assertNoEmojiNoPII(delta, { label: 'delta-report.md' })).not.toThrow();
    expect(() => reporter.assertNoEmojiNoPII(conflict, { label: 'conflict-log.md' })).not.toThrow();
    expect(() => reporter.assertNoEmojiNoPII(run, { label: 'parity-sync-report.md' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// writeReports orchestrator
// ---------------------------------------------------------------------------

describe('writeReports orchestrator', () => {
  /** @type {string} */
  let workspaceRoot;

  beforeEach(() => {
    workspaceRoot = makeTmpDir();
  });

  afterEach(() => {
    cleanupDir(workspaceRoot);
  });

  it('writes all three reports to the configured output dir', () => {
    const result = reporter.writeReports({
      deltas: buildDeltaFixture(),
      decisions: buildDecisionsFixture(),
      runResult: buildRunResultFixture(),
      workspaceRoot,
    });

    expect(fs.existsSync(result.delta.path)).toBe(true);
    expect(fs.existsSync(result.conflict.path)).toBe(true);
    expect(fs.existsSync(result.run.path)).toBe(true);

    const deltaContent = fs.readFileSync(result.delta.path, 'utf8');
    const conflictContent = fs.readFileSync(result.conflict.path, 'utf8');
    const runContent = fs.readFileSync(result.run.path, 'utf8');

    expect(deltaContent).toContain('# the upstream kit Parity Sync — Delta Report');
    expect(conflictContent).toContain('# the upstream kit Parity Sync — Conflict Log');
    expect(runContent).toContain('# the upstream kit Parity Sync — Run Report');
  });

  it('uses default outputDir docs/audits/upstream-parity', () => {
    const result = reporter.writeReports({
      deltas: buildDeltaFixture(),
      decisions: buildDecisionsFixture(),
      runResult: buildRunResultFixture(),
      workspaceRoot,
    });
    expect(result.delta.path).toContain(path.join('docs', 'audits', 'upstream-parity', 'delta-report.md'));
  });

  it('produces byte-stable output across two writes (idempotency, Property 10)', () => {
    const args = {
      deltas: buildDeltaFixture(),
      decisions: buildDecisionsFixture(),
      runResult: buildRunResultFixture(),
      workspaceRoot,
    };

    reporter.writeReports(args);
    const a1 = fs.readFileSync(path.join(workspaceRoot, 'docs/audits/upstream-parity/delta-report.md'));
    const c1 = fs.readFileSync(path.join(workspaceRoot, 'docs/audits/upstream-parity/conflict-log.md'));
    const r1 = fs.readFileSync(path.join(workspaceRoot, 'docs/audits/upstream-parity/parity-sync-report.md'));

    reporter.writeReports(args);
    const a2 = fs.readFileSync(path.join(workspaceRoot, 'docs/audits/upstream-parity/delta-report.md'));
    const c2 = fs.readFileSync(path.join(workspaceRoot, 'docs/audits/upstream-parity/conflict-log.md'));
    const r2 = fs.readFileSync(path.join(workspaceRoot, 'docs/audits/upstream-parity/parity-sync-report.md'));

    expect(a1.equals(a2)).toBe(true);
    expect(c1.equals(c2)).toBe(true);
    expect(r1.equals(r2)).toBe(true);
  });

  it('uses LF line endings (no CRLF) in all three output files', () => {
    reporter.writeReports({
      deltas: buildDeltaFixture(),
      decisions: buildDecisionsFixture(),
      runResult: buildRunResultFixture(),
      workspaceRoot,
    });
    const files = ['delta-report.md', 'conflict-log.md', 'parity-sync-report.md'];
    for (const fname of files) {
      const buf = fs.readFileSync(path.join(workspaceRoot, 'docs/audits/upstream-parity', fname));
      expect(buf.includes('\r\n')).toBe(false);
    }
  });

  it('throws if any rendered report contains emoji (Property 11 final check)', () => {
    // Inject emoji into a delta entry's reason field — Reporter passes
    // it through into output, then assertNoEmojiNoPII catches it.
    const deltas = buildDeltaFixture();
    deltas[0].reason = 'backend-only \u2705';

    expect(() => reporter.writeReports({
      deltas,
      decisions: buildDecisionsFixture(),
      runResult: buildRunResultFixture(),
      workspaceRoot,
    })).toThrow(/Emoji detected/);
  });

  it('respects custom outputDir', () => {
    const result = reporter.writeReports({
      deltas: buildDeltaFixture(),
      decisions: buildDecisionsFixture(),
      runResult: buildRunResultFixture(),
      outputDir: 'custom/reports',
      workspaceRoot,
    });
    expect(result.delta.path).toContain(path.join('custom', 'reports', 'delta-report.md'));
    expect(fs.existsSync(result.delta.path)).toBe(true);
  });

  it('throws TypeError when args is missing', () => {
    expect(() => reporter.writeReports(/** @type {any} */ (null))).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Snapshot equality (task 12.5) — exact string match for 3 fixtures
// ---------------------------------------------------------------------------

describe('snapshot equality (task 12.5) — exact bytes for fixed fixtures', () => {
  it('delta-report snapshot matches expected string', () => {
    const out = reporter.renderDeltaReport(buildDeltaFixture());
    const expected = [
      '# the upstream kit Parity Sync — Delta Report',
      '',
      '## Summary',
      '',
      '| Preset | missing | partial | category-skip | present |',
      '| ------ | ------- | ------- | ------------- | ------- |',
      '| frontend | 1 | 1 | 1 | 0 |',
      '| backend | 0 | 0 | 0 | 1 |',
      '| fullstack | 0 | 0 | 0 | 0 |',
      '| mobile | 0 | 0 | 0 | 0 |',
      '| devops | 0 | 0 | 0 | 0 |',
      '| data-ai | 0 | 0 | 0 | 0 |',
      '| _template | 0 | 0 | 0 | 0 |',
      '',
      '## Details',
      '',
      '### frontend',
      '',
      '- [missing] agents/brainstormer.md (size_lines=101) -> presets/frontend/agents/brainstormer.md',
      '- [partial] skills/aesthetic/SKILL.md (missing references/) -> presets/frontend/skills/aesthetic/SKILL.md',
      '- [category-skip] skills/payment-integration/SKILL.md (reason: backend+fullstack-only)',
      '',
      '### backend',
      '',
      '- [present] agents/brainstormer.md (target_lines=101) -> presets/backend/agents/brainstormer.md',
      '',
      '### fullstack',
      '',
      '- (no entries)',
      '',
      '### mobile',
      '',
      '- (no entries)',
      '',
      '### devops',
      '',
      '- (no entries)',
      '',
      '### data-ai',
      '',
      '- (no entries)',
      '',
      '### _template',
      '',
      '- (no entries)',
      '',
    ].join('\n');
    expect(out).toBe(expected);
  });

  it('conflict-log snapshot matches expected string', () => {
    const out = reporter.renderConflictLog(buildDecisionsFixture());
    const expected = [
      '# the upstream kit Parity Sync — Conflict Log',
      '',
      '## backend/settings.json',
      '',
      '- decision: json-merged',
      '- reason: json-deep-merge: keep target keys, add source-only keys',
      `- source_hash: ${FIXED_HASH_A}`,
      `- target_hash: ${FIXED_HASH_B}`,
      `- timestamp: ${FIXED_TIMESTAMP}`,
      '',
      '## frontend/agents/code-reviewer.md',
      '',
      '- decision: kept-target',
      '- reason: tier-1: target_lines (164) > 1.5 × source_lines (98)',
      `- source_hash: ${FIXED_HASH_A}`,
      `- target_hash: ${FIXED_HASH_B}`,
      `- timestamp: ${FIXED_TIMESTAMP}`,
      '',
      '## frontend/skills/aesthetic/SKILL.md',
      '',
      '- decision: sidecar',
      '- reason: tier-3: |target_lines (50) − source_lines (48)| / max < 0.2',
      `- source_hash: ${FIXED_HASH_C}`,
      `- target_hash: ${FIXED_HASH_A}`,
      `- timestamp: ${FIXED_TIMESTAMP}`,
      '- sidecar_path: frontend/skills/aesthetic/SKILL.source.md',
      '',
    ].join('\n');
    expect(out).toBe(expected);
  });

  it('parity-sync-report snapshot matches expected string', () => {
    const out = reporter.renderParitySyncReport(buildRunResultFixture());
    const expected = [
      '---',
      `timestamp: ${FIXED_TIMESTAMP}`,
      `ranAt: ${FIXED_TIMESTAMP}`,
      '---',
      '',
      '# the upstream kit Parity Sync — Run Report',
      '',
      '## Totals',
      '',
      '- Files ported: 42',
      '- Files skipped: 5',
      '- Conflicts resolved: 3',
      '- Manual review pending: 2',
      '',
      '## Per-Preset Counts (Before vs After)',
      '',
      '| Preset | agents B/A | skills B/A | commands B/A | hooks B/A | workflows B/A |',
      '| ------ | ---------- | ---------- | ------------ | --------- | ------------- |',
      '| frontend | 12/16 | 20/28 | 25/40 | 6/6 | 4/4 |',
      '| backend | 12/16 | 20/28 | 25/49 | 6/6 | 4/4 |',
      '| fullstack | 12/16 | 20/28 | 25/55 | 6/6 | 4/4 |',
      '| mobile | 12/16 | 20/28 | 25/53 | 6/6 | 4/4 |',
      '| devops | 12/16 | 20/28 | 25/47 | 6/6 | 4/4 |',
      '| data-ai | 12/16 | 20/32 | 25/47 | 6/6 | 4/4 |',
      '',
      '## Manual Review Pending (top 20)',
      '',
      '- presets/backend/agents/code-reviewer.source.md',
      '- presets/frontend/skills/aesthetic/SKILL.source.md',
      '',
    ].join('\n');
    expect(out).toBe(expected);
  });
});
