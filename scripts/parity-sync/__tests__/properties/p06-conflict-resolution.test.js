/**
 * Property test P6 — Conflict Resolution Decision Tree.
 *
 * Spec: .kiro/specs/upstream-parity-sync/design.md > Correctness Properties >
 *       Property 6.
 * Task: tasks.md > 9.5 (PBT) Property test P6.
 *
 * **Validates: Requirements 3.2, 6.9, 9.2, 12.1, 12.2, 12.5**
 *
 * Statement (design.md): For all cặp (source, target) mà file target đã tồn
 * tại với nội dung khác source-rebranded, ConflictResolver trả về một
 * ConflictDecision khớp với cây 4-tier theo Req 12.1: nếu
 * target_lines > 1.5 × source_lines thì decision = kept-target; ngược lại
 * nếu source có YAML field mà target thiếu thì decision = merged-frontmatter;
 * ngược lại nếu chênh lệch dòng < 20% thì decision = sidecar; ngược lại
 * decision = kept-target (Tier 4 default). Trong mọi trường hợp, target
 * file gốc không bị xoá khỏi disk.
 *
 * Five property assertions (numRuns=100 each):
 *   6a Tier 1 (kept-target)        — target_lines > 1.5 × source_lines.
 *   6b Tier 2 (merged-frontmatter) — không Tier 1, source có YAML field mới.
 *   6c Tier 3 (sidecar)            — không Tier 1/2, |diff|/max < 20%.
 *   6d Tier 4 (kept-target default)— không match tier khác.
 *   6e No-op (hash equal)          — source và target byte-equal.
 *
 * Strategy: tạo target file thật trong tmp dir (real fs), gọi `resolve` với
 * sourceContent inline, assert decision khớp tier. Cleanup tmp sau mỗi run
 * qua `afterEach` của describe — nhưng vì property runs 100 iterations
 * trong một `it`, dùng helper tạo + cleanup mỗi iteration để tránh leak.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const fc = require('fast-check');

const {
  resolve,
  KEEP_TARGET_RATIO,
  SIDECAR_DIFF_RATIO,
} = require('../../conflict-resolver');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Tạo một file với content cho trước trong tmp dir, trả về tuple
 * `[targetPath, cleanupFn]`. Dùng cho property body để mỗi iteration có
 * file target độc lập.
 *
 * @param {string} content
 * @param {string} [filename]
 * @returns {{ targetPath: string, cleanup: () => void }}
 */
function makeTargetFile(content, filename = 'target.md') {
  const id = crypto.randomBytes(6).toString('hex');
  const dir = path.join(os.tmpdir(), `parity-cr-p6-${process.pid}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  const targetPath = path.join(dir, filename);
  fs.writeFileSync(targetPath, content, 'utf8');
  return {
    targetPath,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  };
}

/**
 * Sinh một string có chính xác `n` dòng. Đảm bảo `countLines` trả về `n`
 * khớp với định nghĩa của resolver. Nếu n=0, trả về string rỗng.
 *
 * Resolver định nghĩa: empty ⇒ 0; non-empty ⇒ count `\n` + 1, trừ 1 nếu
 * kết thúc bằng `\n`. Để có `n` dòng (với n >= 1), tạo string
 * `"L1\nL2\n...\nLn"` (không trailing newline) — count đúng `n`.
 *
 * @param {number} n
 * @param {string} prefix Token để phân biệt source/target content.
 * @returns {string}
 */
function buildContentWithLines(n, prefix) {
  if (n <= 0) return '';
  const lines = [];
  for (let i = 1; i <= n; i++) {
    lines.push(`${prefix}-line-${i}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Source line count: 5..40. Lower bound > 0 để Tier 1 ratio có ý nghĩa.
 */
const arbSourceLines = fc.integer({ min: 5, max: 40 });

/**
 * Target line count for Tier 1 (>1.5 × source): >= ceil(1.5 × source) + 1.
 * Cấp trên thoáng để đảm bảo Tier 1 trigger.
 */
function arbTier1Target(sourceLines) {
  // Tier 1 condition: target > 1.5 * source ⇒ target >= floor(1.5*src) + 1.
  // Ta thêm buffer +1 nữa để chắc chắn (sourceLines integer, 1.5*src có
  // thể là .5 fraction).
  const minTarget = Math.floor(KEEP_TARGET_RATIO * sourceLines) + 1;
  return fc.integer({ min: minTarget, max: minTarget + 50 });
}

/**
 * Target line count for Tier 3 (sidecar): |diff|/max < 20% AND không Tier 1.
 * Đơn giản: chọn target = source ± delta với delta nhỏ. Để đảm bảo
 * |diff|/max < 0.2 strict, dùng delta = 0 hoặc 1, target == source là an toàn.
 *
 * Nhưng nếu target == source và content khác về byte (do chứa "src"/"tgt"
 * prefix), hash sẽ khác ⇒ vào tier tree, Tier 1 false (target_lines !>
 * 1.5*source_lines), Tier 3 true (|0|/max = 0 < 0.2).
 */
function arbTier3Target(sourceLines) {
  // Tier 3 cần |diff|/max < 0.2 strict; chọn delta sao cho ratio đảm bảo.
  // delta = floor(sourceLines * 0.15) ⇒ |delta|/sourceLines = 0.15 < 0.2.
  // Floor để tránh ratio đúng = 0.2.
  const maxSafeDelta = Math.max(0, Math.floor(sourceLines * 0.15));
  return fc
    .integer({ min: -maxSafeDelta, max: maxSafeDelta })
    .map((delta) => Math.max(1, sourceLines + delta));
}

/**
 * Target line count for Tier 4 (default kept-target): không Tier 1
 * (target ≤ 1.5×source), không Tier 3 (|diff|/max ≥ 0.2). Tức target nhỏ
 * hơn source nhiều (nhưng > 0) hoặc target ở giữa nhưng đảm bảo
 * |diff|/max ≥ 0.2.
 *
 * Cách đơn giản: target = ceil(sourceLines * 0.5). Khi đó:
 *   - target_lines > 1.5 × source_lines? → 0.5*src > 1.5*src ⇒ false.
 *   - |diff| / max = (src - 0.5*src) / src = 0.5 ≥ 0.2 ⇒ Tier 3 false.
 *   ⇒ rơi vào Tier 4.
 *
 * Để có random nhỏ, dùng range [floor(src * 0.3), floor(src * 0.7)] (tránh
 * Tier 1 vì <= src; |diff|/src = 0.3..0.7 ≥ 0.2 ⇒ skip Tier 3).
 */
function arbTier4Target(sourceLines) {
  const lo = Math.max(1, Math.floor(sourceLines * 0.3));
  const hi = Math.max(lo, Math.floor(sourceLines * 0.7));
  return fc.integer({ min: lo, max: hi });
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('Property 6: Conflict Resolution Decision Tree — **Validates: Requirements 3.2, 6.9, 9.2, 12.1, 12.2, 12.5**', () => {
  // Feature: upstream-parity-sync, Property 6: Conflict Resolution Decision Tree

  it('6a Tier 1 — target_lines > 1.5 × source_lines ⇒ decision === "kept-target"', () => {
    fc.assert(
      fc.property(
        arbSourceLines.chain((src) =>
          arbTier1Target(src).map((tgt) => ({ src, tgt })),
        ),
        ({ src, tgt }) => {
          const sourceContent = buildContentWithLines(src, 'src');
          const targetContent = buildContentWithLines(tgt, 'tgt');
          const { targetPath, cleanup } = makeTargetFile(targetContent);

          try {
            const decision = resolve({ targetPath, sourceContent });

            expect(decision.decision).toBe('kept-target');
            expect(decision.reason).toMatch(/tier-1/);
            expect(decision.target_hash).not.toBeNull();
            expect(decision.source_hash).toMatch(/^[a-f0-9]{64}$/);
            // Target file vẫn còn trên disk (Req 12.2 — không xoá target).
            expect(fs.existsSync(targetPath)).toBe(true);
            expect(fs.readFileSync(targetPath, 'utf8')).toBe(targetContent);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('6b Tier 2 — không Tier 1, source có YAML field mới ⇒ decision === "merged-frontmatter"', () => {
    // Tier 2 chỉ áp khi cả hai có front-matter và source có field mới mà
    // target thiếu. Sinh source có 2 field, target có 1 field; line counts
    // khớp Tier 3 range để đảm bảo NẾU không vào Tier 2 thì vào Tier 3
    // (giúp test isolate Tier 2 đúng).
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        fc.string({ minLength: 1, maxLength: 8, unit: 'binary-ascii' })
          .filter((s) => /^[a-z][a-z0-9-]*$/.test(s)),
        (sourceLines, name) => {
          // Source có name + description; target chỉ có name ⇒ description là field mới.
          const srcFM = `---\nname: ${name}\ndescription: KiroKit helper\n---\n`;
          const srcBody = buildContentWithLines(sourceLines, 'src');
          const sourceContent = srcFM + srcBody;

          // Target line count gần source (cùng range Tier 3) để đảm bảo
          // Tier 1 không match. Frontmatter chỉ có `name`.
          const tgtFM = `---\nname: ${name}\n---\n`;
          const tgtBody = buildContentWithLines(sourceLines, 'tgt');
          const targetContent = tgtFM + tgtBody;

          const { targetPath, cleanup } = makeTargetFile(targetContent);
          try {
            const decision = resolve({ targetPath, sourceContent });

            expect(decision.decision).toBe('merged-frontmatter');
            expect(decision.reason).toMatch(/tier-2/);
            expect(decision.mergedFrontMatter).toBeDefined();
            expect(decision.mergedFrontMatter.name).toBe(name);
            expect(decision.mergedFrontMatter.description).toBe('KiroKit helper');
            expect(typeof decision.mergedBody).toBe('string');
            // Target file gốc còn trên disk (Req 12.2).
            expect(fs.existsSync(targetPath)).toBe(true);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('6c Tier 3 — không Tier 1/2, |diff|/max < 20% ⇒ decision === "sidecar"', () => {
    fc.assert(
      fc.property(
        arbSourceLines.chain((src) =>
          arbTier3Target(src).map((tgt) => ({ src, tgt })),
        ),
        ({ src, tgt }) => {
          // Build source và target KHÔNG có front-matter để Tier 2 không trigger.
          // Nội dung khác nhau (prefix khác) ⇒ hash khác.
          const sourceContent = buildContentWithLines(src, 'src');
          const targetContent = buildContentWithLines(tgt, 'tgt');
          const { targetPath, cleanup } = makeTargetFile(targetContent);

          try {
            const decision = resolve({ targetPath, sourceContent });

            expect(decision.decision).toBe('sidecar');
            expect(decision.reason).toMatch(/tier-3/);
            expect(typeof decision.sidecar_path).toBe('string');
            expect(decision.sidecar_path).toMatch(/\.source\.md$/);
            expect(fs.existsSync(targetPath)).toBe(true);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('6d Tier 4 — không Tier 1/2/3 ⇒ decision === "kept-target" (default)', () => {
    fc.assert(
      fc.property(
        arbSourceLines.chain((src) =>
          arbTier4Target(src).map((tgt) => ({ src, tgt })),
        ),
        ({ src, tgt }) => {
          const sourceContent = buildContentWithLines(src, 'src');
          const targetContent = buildContentWithLines(tgt, 'tgt');
          const { targetPath, cleanup } = makeTargetFile(targetContent);

          try {
            const decision = resolve({ targetPath, sourceContent });

            expect(decision.decision).toBe('kept-target');
            expect(decision.reason).toMatch(/tier-4/);
            expect(fs.existsSync(targetPath)).toBe(true);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('6e No-op — source và target byte-equal ⇒ decision === "no-op"', () => {
    fc.assert(
      fc.property(
        arbSourceLines,
        (src) => {
          const content = buildContentWithLines(src, 'same');
          const { targetPath, cleanup } = makeTargetFile(content);
          try {
            const decision = resolve({ targetPath, sourceContent: content });

            expect(decision.decision).toBe('no-op');
            expect(decision.source_hash).toBe(decision.target_hash);
            expect(fs.existsSync(targetPath)).toBe(true);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
