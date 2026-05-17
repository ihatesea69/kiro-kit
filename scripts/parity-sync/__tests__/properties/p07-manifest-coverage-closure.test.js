/**
 * Property test P7 — Manifest Coverage and Closure.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/design.md > Correctness Properties >
 *       Property 7.
 * Task: tasks.md > 11.5 (PBT) Property test P7.
 *
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.5, 18.2, 19.2, 19.6, 19.7**
 *
 * Statement (design.md): For all preset `P` sau khi ManifestUpdater hoàn tất,
 * manifest thoả ba invariant đồng thời:
 *   (a) tập file vật lý trong `presets/P/` (trừ `manifest.json`, `README.md`)
 *       bằng tập `entries[*].source` (no orphan, Req 13.3).
 *   (b) mọi `entries[*].source` trỏ đến file tồn tại trên đĩa (no broken link,
 *       Req 13.2 / 19.7).
 *   (c) `JSON.parse(JSON.stringify(manifest))` round-trip giữ nguyên cấu trúc
 *       (Req 13.5 / 19.6).
 *
 * Three property assertions (numRuns=50 each — fs I/O is the cost driver):
 *   7a Lockstep ok          — random valid manifest M + matching filesystem F
 *                             (cùng tập source) ⇒ validate(M, …).ok === true
 *                             VÀ ba sub-invariant a/b/c đồng thời thoả.
 *   7b Inverse broken-link  — bắt đầu từ lockstep, xoá ngẫu nhiên 1 file vật
 *                             lý ⇒ validate(M, …).ok === false với ít nhất
 *                             một error có code === 'E_MANIFEST_BROKEN_LINK'
 *                             trỏ đúng path đã xoá.
 *   7c Inverse orphan       — bắt đầu từ lockstep, thêm 1 file vật lý không
 *                             có entry trong manifest ⇒ validate(M, …).ok ===
 *                             false với ít nhất một error có code ===
 *                             'E_MANIFEST_ORPHAN' trỏ đúng path đã thêm.
 *
 * Strategy:
 *   - Pure CommonJS (require). `describe`/`it`/`expect` exposed as globals
 *     qua `globals: true` của vitest.config.js — không `require('vitest')`.
 *   - Mỗi iteration của fc.property tạo một tmp workspace riêng dưới
 *     `os.tmpdir()` (cùng pattern với p06 + manifest-updater-validate.test.js).
 *     Cleanup qua `try/finally` ngay trong property body — fast-check không
 *     có hook beforeEach/afterEach gắn vào property runner.
 *   - Generators dùng tập category prefix khớp với `deriveTypeFromPath` để
 *     entry `type` rơi vào `KNOWN_TYPES` (ổn định, không phải concern của
 *     validate hiện tại nhưng ràng buộc fixture sạch).
 *   - `fc.uniqueArray` đảm bảo source paths không trùng (validate đòi hỏi
 *     entry shape valid + `source` unique để dedup index trong appendPorted
 *     không bias kết quả).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const fc = require('fast-check');

const {
  validate,
  deriveDefaultTarget,
  deriveTypeFromPath,
  deepEqual,
  KNOWN_TYPES,
  ORPHAN_CHECK_EXEMPT,
} = require('../../manifest-updater');
const { VALID_PRESETS } = require('../../lib/path-utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Test trên 6 preset chính — `_template` là preset scaffolding nội bộ, không
 * tham gia ManifestUpdater pipeline (xem run.js task 13.x). Loại trừ giúp
 * giữ generator domain khớp với production scope của Property 7.
 *
 * @type {ReadonlyArray<string>}
 */
const MAIN_PRESETS = Object.freeze(VALID_PRESETS.filter((p) => p !== '_template'));

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Tạo một tmp workspace duy nhất cho mỗi iteration property. Suffix dùng
 * `crypto.randomBytes` thay vì counter để tránh collision khi vitest chạy
 * concurrent threads trên cùng máy.
 *
 * @returns {string} Absolute OS path tới workspace root vừa tạo.
 */
function makeTmpWorkspace() {
  const id = crypto.randomBytes(6).toString('hex');
  const dir = path.join(
    os.tmpdir(),
    `parity-sync-p7-${process.pid}-${id}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Best-effort cleanup. Swallow lỗi để không che dấu assertion failure thực
 * sự trong test body (Windows EBUSY khi file vẫn open thi thoảng xảy ra
 * nhưng tmp dir nằm dưới os.tmpdir() và OS sẽ tự dọn sau).
 *
 * @param {string} dir
 */
function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Tạo file rỗng cho mỗi POSIX-relative path dưới
 * `<workspaceRoot>/presets/<preset>/`. Tạo parent dir nếu cần. Nội dung
 * rỗng đủ để fs.statSync coi là file (validate chỉ cần stat.isFile()).
 *
 * @param {string} workspaceRoot
 * @param {string} preset
 * @param {string[]} relativePaths POSIX-style preset-relative.
 */
function scaffoldFiles(workspaceRoot, preset, relativePaths) {
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
 * Build manifest object khớp với schema KiroKit hiện hành (key `files`,
 * 3 field bắt buộc per entry). Dùng `deriveDefaultTarget` /
 * `deriveTypeFromPath` của module để đảm bảo target/type derivation khớp
 * production logic — manifest sinh ra giống y output của
 * `manifestUpdater.update(...)` (sau task 11.1) cho cùng tập ported files.
 *
 * @param {string} preset
 * @param {string[]} sources POSIX-style preset-relative source paths.
 * @returns {object} Manifest object.
 */
function buildManifest(preset, sources) {
  return {
    name: preset,
    version: '1.0.0',
    category: preset,
    files: sources.map((src) => ({
      source: src,
      target: deriveDefaultTarget(src),
      type: deriveTypeFromPath(src),
    })),
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbAlnumChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
);

/**
 * Token alnum 2..8 chars — đủ entropy để sinh đường dẫn unique trong
 * fc.uniqueArray nhưng không quá dài làm filesystem chậm. Lower-case only
 * để tránh collision case-insensitive (Windows / macOS HFS+).
 */
const arbToken = fc
  .array(arbAlnumChar, { minLength: 2, maxLength: 8 })
  .map((arr) => arr.join(''));

/**
 * Sinh một POSIX preset-relative source path khớp với một category đã
 * biết của `deriveTypeFromPath` (agents, skills, commands, hooks,
 * workflows, steering). Lựa chọn này:
 *   - Đảm bảo `type` field rơi vào `KNOWN_TYPES` (sanity, không phải
 *     yêu cầu validate, nhưng giữ fixture realistic).
 *   - Phủ đa dạng cấu trúc thư mục (file phẳng vs nested SKILL.md) để
 *     orphan walk + broken-link stat đụng cả hai code path.
 *
 * Skill path dùng pattern `skills/<token>/SKILL.md` để khớp deriveType
 * (returns 'skill'); single-token cho path uniqueness ổn định.
 *
 * @type {fc.Arbitrary<string>}
 */
const arbSourcePath = fc.oneof(
  arbToken.map((t) => `agents/${t}.md`),
  arbToken.map((t) => `skills/${t}/SKILL.md`),
  arbToken.map((t) => `commands/${t}.md`),
  arbToken.map((t) => `workflows/${t}.md`),
  arbToken.map((t) => `hooks/${t}.js`),
  arbToken.map((t) => `steering/${t}.md`),
);

const arbPreset = fc.constantFrom(...MAIN_PRESETS);

/**
 * Sinh extra orphan path với prefix marker `__orphan_` ở basename — token
 * trong `arbToken` chỉ chứa `[a-z0-9]` (không underscore), nên prefix này
 * KHÔNG BAO GIỜ trùng với một path thường được sinh bởi `arbSourcePath`.
 * Đảm bảo property 7c không cần `fc.pre` filter và mỗi run đều generate
 * cặp valid (sources, extra) có giao trống.
 *
 * @type {fc.Arbitrary<string>}
 */
const arbExtraOrphanPath = arbToken.map((t) => `agents/__orphan_${t}.md`);

// ---------------------------------------------------------------------------
// Helpers — assert ba sub-invariant
// ---------------------------------------------------------------------------

/**
 * Assert sub-invariant (c): JSON round-trip preserves manifest. Tách helper
 * để reuse trong cả 7a (lockstep ok) và mô tả rõ ý nghĩa của 1 trong 3
 * điều kiện bằng nhau trong Property 7.
 *
 * Dùng `deepEqual` của module — đây chính là helper mà `validate.check 1`
 * dùng nội bộ, nên test khẳng định cùng oracle.
 *
 * @param {object} manifest
 */
function assertRoundTripPreserves(manifest) {
  const roundTripped = JSON.parse(JSON.stringify(manifest));
  expect(deepEqual(manifest, roundTripped)).toBe(true);
}

/**
 * Assert sub-invariant (b): mọi entry.source có file vật lý tồn tại trên
 * đĩa. Tách ra cho assertion message rõ ràng khi fail.
 *
 * @param {string} workspaceRoot
 * @param {string} preset
 * @param {Array<{source: string}>} entries
 */
function assertAllSourcesExist(workspaceRoot, preset, entries) {
  for (const entry of entries) {
    const osRel = entry.source.split('/').join(path.sep);
    const full = path.join(workspaceRoot, 'presets', preset, osRel);
    const stat = fs.statSync(full);
    expect(stat.isFile()).toBe(true);
  }
}

/**
 * Assert sub-invariant (a): tập file vật lý dưới preset dir (trừ
 * ORPHAN_CHECK_EXEMPT) bằng tập entry.source. Dùng Set + symmetric-diff
 * style assertion để báo lỗi chính xác phía nào dư.
 *
 * @param {string} workspaceRoot
 * @param {string} preset
 * @param {string[]} declaredSources
 */
function assertNoOrphanNoBrokenLink(workspaceRoot, preset, declaredSources) {
  const declaredSet = new Set(declaredSources);
  const presetDir = path.join(workspaceRoot, 'presets', preset);

  /** @type {string[]} */
  const physicalFiles = [];
  /**
   * Recursive walker — duplicate logic của walkPresetFiles nhỏ gọn để
   * test-side không phụ thuộc thêm export. Skip ORPHAN_CHECK_EXEMPT
   * trực tiếp tại level này (tương đương phía validate).
   *
   * @param {string} dir
   * @param {string} base
   */
  function walk(dir, base) {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return;
      throw err;
    }
    for (const ent of entries) {
      const childPath = path.join(dir, ent.name);
      const rel = base === '' ? ent.name : `${base}/${ent.name}`;
      if (ent.isDirectory()) {
        walk(childPath, rel);
      } else if (ent.isFile()) {
        physicalFiles.push(rel);
      }
    }
  }
  walk(presetDir, '');

  const physicalSet = new Set(
    physicalFiles.filter((p) => !ORPHAN_CHECK_EXEMPT.has(p)),
  );

  // Hai chiều bằng nhau: mọi physical ∈ declared (no orphan) + mọi
  // declared ∈ physical (no broken link).
  for (const phys of physicalSet) {
    expect(declaredSet.has(phys)).toBe(true);
  }
  for (const decl of declaredSet) {
    expect(physicalSet.has(decl)).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('Property 7: Manifest Coverage and Closure — **Validates: Requirements 13.1, 13.2, 13.3, 13.5, 18.2, 19.2, 19.6, 19.7**', () => {
  // Feature: claudekit-parity-sync, Property 7: Manifest Coverage and Closure.

  it('7a: lockstep manifest+filesystem ⇒ validate.ok === true (3 invariants đồng thời)', () => {
    fc.assert(
      fc.property(
        arbPreset,
        fc.uniqueArray(arbSourcePath, { minLength: 0, maxLength: 30 }),
        (preset, sources) => {
          const workspaceRoot = makeTmpWorkspace();
          try {
            scaffoldFiles(workspaceRoot, preset, sources);
            const manifest = buildManifest(preset, sources);

            const result = validate(manifest, { preset, workspaceRoot });
            expect(result.ok).toBe(true);
            expect(result.errors).toEqual([]);

            // Sub-invariants (a), (b), (c) — ba điều kiện đồng thời của
            // Property 7. Validate đã check tất cả; ở đây re-assert
            // bằng test-side oracle để bắt regression dạng "validate
            // trả về ok=true mà thực tế disk state không khớp".
            assertRoundTripPreserves(manifest);
            assertAllSourcesExist(workspaceRoot, preset, manifest.files);
            assertNoOrphanNoBrokenLink(workspaceRoot, preset, sources);

            // Sanity: type field rơi vào KNOWN_TYPES (không phải yêu cầu
            // của Property 7 nhưng đảm bảo generator hợp lệ).
            for (const entry of manifest.files) {
              expect(KNOWN_TYPES.has(entry.type)).toBe(true);
            }
          } finally {
            cleanupDir(workspaceRoot);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('7b inverse: xoá 1 file vật lý ⇒ validate.ok === false với E_MANIFEST_BROKEN_LINK', () => {
    fc.assert(
      fc.property(
        arbPreset,
        fc.uniqueArray(arbSourcePath, { minLength: 1, maxLength: 30 }),
        fc.nat(),
        (preset, sources, indexSeed) => {
          const workspaceRoot = makeTmpWorkspace();
          try {
            scaffoldFiles(workspaceRoot, preset, sources);
            const manifest = buildManifest(preset, sources);

            // Sanity check: lockstep state hợp lệ TRƯỚC khi mutate.
            // Nếu fail ở đây, bug ở 7a chứ không phải ở 7b.
            const before = validate(manifest, { preset, workspaceRoot });
            expect(before.ok).toBe(true);

            // Pick 1 source để xoá (force broken-link). indexSeed cho
            // shrinking có thể tìm minimal counter-example.
            const removeIdx = indexSeed % sources.length;
            const removedSource = sources[removeIdx];
            const osRel = removedSource.split('/').join(path.sep);
            const removedFull = path.join(
              workspaceRoot, 'presets', preset, osRel,
            );
            fs.unlinkSync(removedFull);

            const result = validate(manifest, { preset, workspaceRoot });
            expect(result.ok).toBe(false);

            const brokenLinks = result.errors.filter(
              (e) => e.code === 'E_MANIFEST_BROKEN_LINK',
            );
            expect(brokenLinks.length).toBeGreaterThanOrEqual(1);
            expect(brokenLinks.some((e) => e.path === removedSource)).toBe(true);
          } finally {
            cleanupDir(workspaceRoot);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('7c inverse: thêm 1 file vật lý không có entry ⇒ validate.ok === false với E_MANIFEST_ORPHAN', () => {
    fc.assert(
      fc.property(
        arbPreset,
        fc.uniqueArray(arbSourcePath, { minLength: 0, maxLength: 30 }),
        arbExtraOrphanPath,
        (preset, sources, extra) => {
          // Generator constraint: arbExtraOrphanPath dùng prefix marker
          // `__orphan_` mà arbSourcePath không bao giờ sinh ra → giao
          // trống không cần fc.pre filter. Defensive assertion để bắt
          // regression nếu generator thay đổi:
          expect(sources.includes(extra)).toBe(false);

          const workspaceRoot = makeTmpWorkspace();
          try {
            scaffoldFiles(workspaceRoot, preset, sources);
            // Manifest chỉ chứa `sources`, KHÔNG include `extra`.
            const manifest = buildManifest(preset, sources);

            // Sanity: lockstep state hợp lệ TRƯỚC khi thêm orphan.
            const before = validate(manifest, { preset, workspaceRoot });
            expect(before.ok).toBe(true);

            // Thêm file vật lý không có entry — orphan condition.
            scaffoldFiles(workspaceRoot, preset, [extra]);

            const result = validate(manifest, { preset, workspaceRoot });
            expect(result.ok).toBe(false);

            const orphans = result.errors.filter(
              (e) => e.code === 'E_MANIFEST_ORPHAN',
            );
            expect(orphans.length).toBeGreaterThanOrEqual(1);
            expect(orphans.some((e) => e.path === extra)).toBe(true);
          } finally {
            cleanupDir(workspaceRoot);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
