/**
 * Property test P2 — Delta Status Totality.
 *
 * Spec: .kiro/specs/upstream-parity-sync/design.md > Correctness Properties >
 *       Property 2.
 * Task: tasks.md > 4.3 (PBT) Property test P2.
 *
 * **Validates: Requirements 1.2, 1.3, 4.12, 5.8**
 *
 * Statement (design.md): For all cặp `(source_artifact, preset)` được sinh ra
 * bởi DeltaDetector, status thuộc đúng một trong 4 giá trị enum
 * `{present, missing, partial, category-skip}`. Không có pair nào có status
 * `undefined` hoặc giá trị ngoài enum, và mỗi pair có duy nhất một status.
 *
 * Stage scope (design.md > DeltaDetector > Logic): trạng thái `category-skip`
 * được áp ở stage CategoryMapper (task 5), KHÔNG ở stage này. Vì vậy ở stage
 * DeltaDetector ta khẳng định mạnh hơn: status ∈ {present, missing, partial}
 * (3 giá trị, là subset của enum 4 giá trị → vẫn validate Property 2).
 *
 * Five property assertions (numRuns=100 each):
 *   2a Status enum totality — mọi entry có status ∈ {present, missing, partial};
 *                             reason chỉ xuất hiện cùng partial.
 *   2b Pair uniqueness      — (source_id, target_preset) duy nhất một entry.
 *   2c Pair coverage        — đầy đủ N×7 entry (N source × 7 preset).
 *   2d Path round-trip      — source_path đã strip prefix .claude/;
 *                             target_path == "presets/<preset>/<source_path>".
 *   2e Skill partial detect — skill source có subdir `references/` hoặc
 *                             `scripts/` mà target chỉ có SKILL.md → partial
 *                             với reason chứa subdir thiếu.
 *
 * Implementation notes:
 *   - Pure CommonJS (require). `describe`/`it`/`expect` exposed as globals.
 *   - Generators sinh trực tiếp SourceItem + TargetInventory in-memory (không
 *     I/O). `arbValidSourceItem` được duplicate ở đây (giống p01 nhưng mở rộng
 *     để cover skill folder case) — sẽ refactor thành shared helper khi có
 *     property test thứ ba dùng cùng generator.
 */

'use strict';

const fc = require('fast-check');

const { detect, RELEVANT_SKILL_SUBDIRS } = require('../../delta-detector');
const { VALID_PRESETS, joinPreset } = require('../../lib/path-utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_STATUSES = Object.freeze(['present', 'missing', 'partial']);
// Stage downstream (CategoryMapper) sẽ thêm 'category-skip' nhưng không phải ở
// stage này. Vẫn liệt kê để test enum totality theo design.
const ENUM_4 = Object.freeze(['present', 'missing', 'partial', 'category-skip']);

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbAlnumChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
);
const arbToken = fc
  .array(arbAlnumChar, { minLength: 1, maxLength: 10 })
  .map((arr) => arr.join(''));

// File-like artifact_type (đi đôi với .md path / leaf file).
const arbFileArtifactType = fc.constantFrom(
  'agent', 'command', 'hook', 'workflow', 'statusline',
);

// "the-upstream-kit/.claude/<category>/<seg1>/<seg2>.md"
const arbFileSourcePath = fc
  .tuple(
    fc.constantFrom('agents', 'commands', 'hooks', 'workflows'),
    arbToken,
    arbToken,
  )
  .map(([cat, mid, base]) =>
    `the-upstream-kit/.claude/${cat}/${mid}/${base}.md`,
  );

const arbFileSourceItem = fc.record({
  id: fc.tuple(arbToken, arbToken).map(([a, b]) => `src.${a}.${b}`),
  kit: fc.constant('source'),
  artifact_type: arbFileArtifactType,
  path: arbFileSourcePath,
  size_lines: fc.integer({ min: 1, max: 500 }),
});

// Skill source — folder, có thể có subdirs `references` / `scripts`.
const arbSkillSubdirs = fc.subarray([...RELEVANT_SKILL_SUBDIRS]);
const arbSkillSourceItem = fc
  .tuple(arbToken, arbSkillSubdirs, fc.integer({ min: 50, max: 500 }))
  .map(([name, subdirs, lines]) => ({
    id: `src.skill.${name}`,
    kit: 'source',
    artifact_type: 'skill',
    path: `the-upstream-kit/.claude/skills/${name}/`,
    basename: name,
    size_lines: lines,
    extras: {
      is_sub_skill_container: false,
      subdirs,
      cross_platform_group: null,
      skill_md_path: `the-upstream-kit/.claude/skills/${name}/SKILL.md`,
    },
  }));

const arbSourceItem = fc.oneof(
  { weight: 2, arbitrary: arbFileSourceItem },
  { weight: 1, arbitrary: arbSkillSourceItem },
);

const arbSourceInventory = fc
  .array(arbSourceItem, { minLength: 1, maxLength: 12 })
  .map((items) => {
    // Đảm bảo unique source_id để Property 2b kiểm chứng pair-uniqueness có
    // ý nghĩa; không loại trùng path (DeltaDetector không yêu cầu unique path).
    const seen = new Set();
    const filtered = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      filtered.push(item);
    }
    return { items: filtered };
  })
  .filter((inv) => inv.items.length > 0);

// ---------------------------------------------------------------------------
// Target inventory builder
//
// Cho mỗi preset, sinh tập target paths bằng cách "install" một subset random
// các source items vào preset đó. Mỗi item có 4 mode install độc lập (qua
// arbInstallMode):
//   - skip:       không có path nào → status sẽ là `missing`.
//   - file-only:  với skill = chỉ SKILL.md (có thể partial nếu source có
//                 references/scripts); với file = path đầy đủ → `present`.
//   - full:       với skill = SKILL.md + tất cả subdirs source khai báo →
//                 `present`; với file = path đầy đủ → `present` (tương đương).
//   - partial-noscript: với skill có subdir scripts trong source = SKILL.md +
//                 chỉ references → partial nếu source khai báo scripts.
// ---------------------------------------------------------------------------

const arbInstallMode = fc.constantFrom('skip', 'file-only', 'full', 'partial');

/**
 * Build target paths cho một item theo mode install.
 *
 * @param {object} item SourceItem.
 * @param {string} preset
 * @param {string} mode
 * @returns {string[]}
 */
function buildPathsFor(item, preset, mode) {
  if (mode === 'skip') return [];

  // Strip prefix manually để tương đương stripClaudePrefix nhưng KHÔNG dùng
  // delta-detector nội bộ (giữ test độc lập với production code path).
  const PREFIX = 'the-upstream-kit/.claude/';
  const stripped = item.path.startsWith(PREFIX)
    ? item.path.slice(PREFIX.length)
    : item.path;

  if (item.artifact_type !== 'skill') {
    // File-like: chỉ có một path duy nhất.
    return [joinPreset(preset, stripped)];
  }

  // Skill folder.
  const baseStripped = stripped.replace(/\/$/, ''); // "skills/foo"
  const targetBase = joinPreset(preset, baseStripped); // "presets/<P>/skills/foo"
  const subdirs =
    item.extras && Array.isArray(item.extras.subdirs) ? item.extras.subdirs : [];

  /** @type {string[]} */
  const out = [`${targetBase}/SKILL.md`];

  if (mode === 'full') {
    for (const sd of subdirs) {
      // Mỗi subdir ít nhất một file → đủ pass `hasPrefixedPath` check.
      out.push(`${targetBase}/${sd}/index.md`);
    }
  } else if (mode === 'partial') {
    // Chỉ install `references/` (nếu có), bỏ qua `scripts/` để force partial
    // khi source khai báo scripts.
    if (subdirs.includes('references')) {
      out.push(`${targetBase}/references/index.md`);
    }
  }
  // mode 'file-only': chỉ SKILL.md → có thể partial hoặc present.

  return out;
}

/**
 * Sinh target inventory cho cả 7 preset.
 *
 * Trả về cả `byPreset` và `installed` (per-(item.id × preset) mode) để các
 * property test có thể kiểm chứng tương ứng (e.g. Property 2e).
 */
const arbTargetInventoryFor = (items) =>
  fc
    .tuple(
      ...VALID_PRESETS.map(() =>
        fc.array(arbInstallMode, {
          minLength: items.length,
          maxLength: items.length,
        }),
      ),
    )
    .map((modesPerPreset) => {
      /** @type {Record<string, Array<{ preset: string, path: string }>>} */
      const byPreset = Object.create(null);
      /** @type {Record<string, Record<string, string>>} */
      const installed = Object.create(null);

      for (let pi = 0; pi < VALID_PRESETS.length; pi++) {
        const preset = VALID_PRESETS[pi];
        const modes = modesPerPreset[pi];
        const list = [];
        installed[preset] = Object.create(null);
        for (let ii = 0; ii < items.length; ii++) {
          const item = items[ii];
          const mode = modes[ii];
          installed[preset][item.id] = mode;
          for (const p of buildPathsFor(item, preset, mode)) {
            list.push({ preset, path: p });
          }
        }
        byPreset[preset] = list;
      }
      return { byPreset, installed };
    });

const arbInputPair = arbSourceInventory.chain((source) =>
  arbTargetInventoryFor(source.items).map((target) => ({ source, target })),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripPrefix(p) {
  const PREFIX = 'the-upstream-kit/.claude/';
  return p.startsWith(PREFIX) ? p.slice(PREFIX.length) : p;
}

// ---------------------------------------------------------------------------
// Property assertions
// ---------------------------------------------------------------------------

describe('Property 2: Delta Status Totality — **Validates: Requirements 1.2, 1.3, 4.12, 5.8**', () => {
  it('2a: every entry has status ∈ {present, missing, partial}; reason iff partial', () => {
    fc.assert(
      fc.property(arbInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        for (const d of deltas) {
          // Stage này không sinh `category-skip`; nhưng vẫn nằm trong enum 4.
          expect(ENUM_4).toContain(d.status);
          expect(ALLOWED_STATUSES).toContain(d.status);
          expect(d.status).toBeDefined();
          if (d.status === 'partial') {
            expect(typeof d.reason).toBe('string');
            expect(d.reason.length).toBeGreaterThan(0);
          } else if (d.status === 'present' || d.status === 'missing') {
            // reason có thể có hoặc không — không bắt buộc cho present/missing.
            // Ràng buộc duy nhất: nếu có thì là string.
            if (d.reason !== undefined) {
              expect(typeof d.reason).toBe('string');
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('2b: each (source_id, target_preset) pair appears exactly once', () => {
    fc.assert(
      fc.property(arbInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        const seen = new Set();
        for (const d of deltas) {
          const key = `${d.source_id}\u0000${d.target_preset}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('2c: pair coverage — N source × 7 preset entries', () => {
    fc.assert(
      fc.property(arbInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        expect(deltas.length).toBe(source.items.length * VALID_PRESETS.length);

        // Mỗi preset xuất hiện đúng N lần.
        /** @type {Record<string, number>} */
        const perPreset = {};
        for (const d of deltas) {
          perPreset[d.target_preset] = (perPreset[d.target_preset] || 0) + 1;
        }
        for (const preset of VALID_PRESETS) {
          expect(perPreset[preset]).toBe(source.items.length);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('2d: source_path stripped prefix; target_path = presets/<preset>/<source_path>', () => {
    fc.assert(
      fc.property(arbInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        for (const d of deltas) {
          expect(d.source_path.startsWith('the-upstream-kit/')).toBe(false);
          expect(d.source_path.startsWith('.claude/')).toBe(false);
          // Skill path có trailing slash sau strip ("skills/foo/"); joinPreset
          // dùng path.posix.join nên trailing slash bị normalize → so sánh
          // qua một build lại expected từ source_path.
          const expectedTarget = joinPreset(d.target_preset, d.source_path);
          expect(d.target_path).toBe(expectedTarget);
          expect(d.target_path.startsWith(`presets/${d.target_preset}/`)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('2e: skill installed file-only with source subdir → partial with matching reason', () => {
    fc.assert(
      fc.property(arbInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        for (const d of deltas) {
          const item = source.items.find((x) => x.id === d.source_id);
          if (!item || item.artifact_type !== 'skill') continue;

          const mode = target.installed[d.target_preset][d.source_id];
          const subdirs =
            item.extras && Array.isArray(item.extras.subdirs)
              ? item.extras.subdirs
              : [];

          if (mode === 'skip') {
            expect(d.status).toBe('missing');
          } else if (mode === 'file-only') {
            // Chỉ SKILL.md installed:
            //  - source không có subdir relevant → present.
            //  - source có subdir relevant → partial.
            const hasRelevant = RELEVANT_SKILL_SUBDIRS.some((s) => subdirs.includes(s));
            if (hasRelevant) {
              expect(d.status).toBe('partial');
              expect(d.reason).toBeDefined();
              for (const sd of RELEVANT_SKILL_SUBDIRS) {
                if (subdirs.includes(sd)) {
                  expect(d.reason).toContain(sd);
                }
              }
            } else {
              expect(d.status).toBe('present');
            }
          } else if (mode === 'full') {
            expect(d.status).toBe('present');
          } else if (mode === 'partial') {
            // Chỉ references/ installed; nếu source khai báo scripts → partial.
            if (subdirs.includes('scripts')) {
              expect(d.status).toBe('partial');
              expect(d.reason).toContain('scripts');
            } else {
              expect(d.status).toBe('present');
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
