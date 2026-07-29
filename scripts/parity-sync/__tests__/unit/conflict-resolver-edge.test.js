/**
 * Unit test: ConflictResolver edge case 12.4 — sidecar idempotency after
 * maintainer review.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Task: tasks.md > 9.6 — "chạy lần 1 sinh sidecar, xoá, chạy lần 2 không
 *       sinh lại".
 *
 * Requirement 12.4: "IF maintainer đã review và xoá file
 * `<basename>.source.md`, THEN THE Parity_Sync_Process SHALL coi conflict
 * đã được giải quyết ở lần chạy tiếp theo."
 *
 * Implementation strategy: caller truyền `opts.sessionState.resolvedSidecars`
 * (Set<string>) chứa các sidecar path mà maintainer đã review/xoá. Resolver
 * kiểm tra trước tier tree — nếu sidecar path nằm trong set, decision =
 * `kept-target` với reason `sidecar-resolved-by-maintainer` (không sinh
 * sidecar mới).
 *
 * Test scenarios:
 *   1. First run on Tier 3 conflict → decision === 'sidecar', sidecar
 *      created on disk after applyDecision.
 *   2. Maintainer deletes the sidecar manually.
 *   3. Second run with `sessionState.resolvedSidecars` containing sidecar
 *      path → decision === 'kept-target', sidecar NOT regenerated.
 *   4. Bonus: applyDecision is idempotent if sidecar exists with same
 *      content — wasNoOp === true on second apply.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  resolve,
  applyDecision,
  buildSidecarPath,
} = require('../../conflict-resolver');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Tạo isolated tmp dir.
 *
 * @returns {string}
 */
function makeTmpDir() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(os.tmpdir(), `parity-cr-edge-${process.pid}-${id}`);
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

/**
 * Build content với N dòng, không front-matter, prefix tag.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConflictResolver edge 12.4 — sidecar idempotency after maintainer review', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let targetPath;

  beforeEach(() => {
    dir = makeTmpDir();
    targetPath = path.join(dir, 'agent.md');
  });

  afterEach(() => {
    cleanupDir(dir);
  });

  it('first run on Tier 3 conflict → decision sidecar, sidecar file created on apply', () => {
    // Source 20 lines, target 19 lines, prefix khác → |diff|/max ≈ 5% < 20%
    // → Tier 3 trigger.
    const sourceContent = buildLines(20, 'src');
    const targetContent = buildLines(19, 'tgt');
    fs.writeFileSync(targetPath, targetContent, 'utf8');

    const decision = resolve({ targetPath, sourceContent });

    expect(decision.decision).toBe('sidecar');
    expect(typeof decision.sidecar_path).toBe('string');
    expect(decision.sidecar_path).toBe(buildSidecarPath(targetPath));
    expect(decision.sidecar_path.endsWith('.source.md')).toBe(true);

    // Sidecar chưa tồn tại trước apply.
    expect(fs.existsSync(decision.sidecar_path)).toBe(false);

    const result = applyDecision(decision, { sourceContent });

    expect(result.wrote).toBe(true);
    expect(result.wasNoOp).toBe(false);
    expect(result.path).toBe(decision.sidecar_path);
    expect(fs.existsSync(decision.sidecar_path)).toBe(true);
    expect(fs.readFileSync(decision.sidecar_path, 'utf8')).toBe(sourceContent);

    // Target file gốc không bị thay đổi (Req 12.2).
    expect(fs.readFileSync(targetPath, 'utf8')).toBe(targetContent);
  });

  it('second run after maintainer deletes sidecar with sessionState → decision kept-target, sidecar NOT regenerated', () => {
    const sourceContent = buildLines(20, 'src');
    const targetContent = buildLines(19, 'tgt');
    fs.writeFileSync(targetPath, targetContent, 'utf8');

    // ----- Run 1: sidecar created -----
    const decision1 = resolve({ targetPath, sourceContent });
    expect(decision1.decision).toBe('sidecar');
    const sidecarPath = /** @type {string} */ (decision1.sidecar_path);
    applyDecision(decision1, { sourceContent });
    expect(fs.existsSync(sidecarPath)).toBe(true);

    // ----- Maintainer reviews and deletes sidecar -----
    fs.unlinkSync(sidecarPath);
    expect(fs.existsSync(sidecarPath)).toBe(false);

    // ----- Run 2: sessionState marks sidecar as resolved -----
    const sessionState = {
      resolvedSidecars: new Set([sidecarPath]),
    };
    const decision2 = resolve({ targetPath, sourceContent, sessionState });

    expect(decision2.decision).toBe('kept-target');
    expect(decision2.reason).toBe('sidecar-resolved-by-maintainer');
    expect(decision2.target_hash).not.toBeNull();
    expect(decision2.source_hash).toMatch(/^[a-f0-9]{64}$/);

    // applyDecision phải là no-op cho kept-target.
    const result2 = applyDecision(decision2, { sourceContent });
    expect(result2.wrote).toBe(false);
    expect(result2.wasNoOp).toBe(true);

    // Sidecar VẪN không tồn tại sau lần chạy thứ 2.
    expect(fs.existsSync(sidecarPath)).toBe(false);

    // Target file gốc không bị thay đổi.
    expect(fs.readFileSync(targetPath, 'utf8')).toBe(targetContent);
  });

  it('without sessionState, second run still treats Tier 3 as sidecar (no automatic disk-based tracking)', () => {
    // Confirm that the resolution is opt-in via sessionState — tránh hidden
    // filesystem state. Maintainer phải explicitly inject resolvedSidecars
    // qua run.js config; nếu không, behavior fallback = sidecar tier như
    // run đầu tiên (Req 15.1 idempotent về NỘI DUNG file, không về quyết
    // định trừ khi sidecar còn trên disk).
    const sourceContent = buildLines(20, 'src');
    const targetContent = buildLines(19, 'tgt');
    fs.writeFileSync(targetPath, targetContent, 'utf8');

    // Run 1: sidecar created.
    const decision1 = resolve({ targetPath, sourceContent });
    const sidecarPath = /** @type {string} */ (decision1.sidecar_path);
    applyDecision(decision1, { sourceContent });

    // Maintainer xoá sidecar nhưng KHÔNG cung cấp sessionState.
    fs.unlinkSync(sidecarPath);

    const decision2 = resolve({ targetPath, sourceContent });
    // Vẫn Tier 3 vì line counts không đổi.
    expect(decision2.decision).toBe('sidecar');
    expect(decision2.sidecar_path).toBe(sidecarPath);
  });

  it('applyDecision sidecar is idempotent when sidecar already exists with same content', () => {
    // Nếu pipeline chạy lại mà sidecar chưa bị xoá (content giống),
    // applyDecision không re-write file (wasNoOp=true).
    const sourceContent = buildLines(20, 'src');
    const targetContent = buildLines(19, 'tgt');
    fs.writeFileSync(targetPath, targetContent, 'utf8');

    const decision = resolve({ targetPath, sourceContent });
    expect(decision.decision).toBe('sidecar');
    const sidecarPath = /** @type {string} */ (decision.sidecar_path);

    // First apply: write.
    const r1 = applyDecision(decision, { sourceContent });
    expect(r1.wrote).toBe(true);
    expect(r1.wasNoOp).toBe(false);
    const mtime1 = fs.statSync(sidecarPath).mtimeMs;

    // Second apply with same content: skip write (idempotent).
    const r2 = applyDecision(decision, { sourceContent });
    expect(r2.wrote).toBe(false);
    expect(r2.wasNoOp).toBe(true);
    const mtime2 = fs.statSync(sidecarPath).mtimeMs;
    // mtime should remain unchanged (best-effort assertion; some filesystems
    // có thể không track mtime với resolution sub-ms, nhưng skip-write nghĩa
    // là không có syscall write nào trên file).
    expect(mtime2).toBe(mtime1);
  });

  it('sessionState.resolvedSidecars works even if target file would otherwise hit Tier 1 or Tier 4', () => {
    // sessionState short-circuits TRƯỚC tier tree, nên áp dụng cho mọi
    // conflict ngoại trừ no-op (hash equal đã handle riêng) và write-new
    // (target không tồn tại).
    const sourceContent = buildLines(10, 'src');
    // Tier 1 case: target_lines = 30, source_lines = 10 → 30 > 1.5*10.
    const targetContent = buildLines(30, 'tgt');
    fs.writeFileSync(targetPath, targetContent, 'utf8');

    const sidecarPath = buildSidecarPath(targetPath);
    const sessionState = { resolvedSidecars: new Set([sidecarPath]) };

    const decision = resolve({ targetPath, sourceContent, sessionState });
    expect(decision.decision).toBe('kept-target');
    expect(decision.reason).toBe('sidecar-resolved-by-maintainer');
  });
});
