/**
 * Property test P3 — Category Mapping Correctness.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/design.md > Correctness Properties >
 *       Property 3.
 * Task: tasks.md > 5.3 (PBT) Property test P3.
 *
 * **Validates: Requirements 1.3, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.12, 5.2, 5.3,
 * 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4**
 *
 * Statement (design.md): For all artifact `A` (agent, skill, command) trong
 * source inventory và mọi preset `P` trong 6 preset chính, kết quả phân loại
 * `(A, P)` khớp với bảng `CATEGORY_RULES`:
 *   - Nếu `CATEGORY_RULES[A]` chứa `P`, status có thể là present|missing|partial
 *     (KHÔNG bao giờ là `category-skip`).
 *   - Nếu `CATEGORY_RULES[A]` KHÔNG chứa `P`, status PHẢI là `category-skip`
 *     với reason không rỗng.
 *
 * Pipeline tested: SourceItem[] → DeltaDetector.detect → CategoryMapper.apply.
 *
 * Six property assertions (numRuns=100 each):
 *   3a Positive direction   — rule contains target_preset → status ∈
 *                             {present, missing, partial}; never category-skip.
 *   3b Negative direction   — rule does NOT contain target_preset → status =
 *                             'category-skip' with non-empty reason matching
 *                             `categorySkipReason(targetPresets)`.
 *   3c Empty target_presets — rule === [] → reason === 'merged-into-tri-script'.
 *   3d No-rule fallback     — artifact không có entry CATEGORY_RULES → status
 *                             = 'category-skip', reason === 'no-rule'.
 *   3e Idempotency          — apply(apply(deltas)) === apply(deltas) (status
 *                             ổn định, không bị flip qua lại).
 *   3f Length + no mutation — output.length === input.length; input không
 *                             bị mutate.
 *
 * Implementation notes:
 *   - Pure CommonJS (require). `describe`/`it`/`expect` exposed as globals.
 *   - Generators dùng tập "known basenames" rút từ CATEGORY_RULES thật để
 *     đảm bảo `lookupRule` trả về rule non-null (cần cho 3a/3b/3c). Test 3d
 *     dùng tập basenames "unknown" (không có trong CATEGORY_RULES).
 *   - Target inventory được sinh để `installed` paths có hoặc không, để
 *     status tiền-mapping bao phủ {present, missing, partial} — assert khẳng
 *     định CategoryMapper KHÔNG flip status khi rule khớp.
 */

'use strict';

const fc = require('fast-check');

const { detect } = require('../../delta-detector');
const { apply, categorySkipReason } = require('../../category-mapper');
const {
  CATEGORY_RULES,
  ALL_MAIN_PRESETS,
  lookupRule,
  presetMatches,
  idOf,
} = require('../../category-rules');
const { VALID_PRESETS, joinPreset } = require('../../lib/path-utils');

// ---------------------------------------------------------------------------
// Universe of "known" source items (artifact_type + path) sao cho idOf →
// basename xuất hiện trong CATEGORY_RULES.
//
// Mỗi entry phải:
//   - Có `path` POSIX với prefix `claudekit-engineer-main/.claude/...`.
//   - idOf(item) chính xác == basename trong CATEGORY_RULES.
// ---------------------------------------------------------------------------

const KNOWN_TEMPLATES = Object.freeze([
  // ----- Agents (all 6) -----
  { artifact_type: 'agent', basename: 'brainstormer',
    path: 'claudekit-engineer-main/.claude/agents/brainstormer.md' },
  { artifact_type: 'agent', basename: 'planner',
    path: 'claudekit-engineer-main/.claude/agents/planner.md' },
  { artifact_type: 'agent', basename: 'tester',
    path: 'claudekit-engineer-main/.claude/agents/tester.md' },

  // ----- Skills (subsets) -----
  // ai-multimodal -> ALL 6
  { artifact_type: 'skill', basename: 'ai-multimodal',
    path: 'claudekit-engineer-main/.claude/skills/ai-multimodal/' },
  // threejs -> frontend, fullstack
  { artifact_type: 'skill', basename: 'threejs',
    path: 'claudekit-engineer-main/.claude/skills/threejs/' },
  // shopify -> backend, fullstack
  { artifact_type: 'skill', basename: 'shopify',
    path: 'claudekit-engineer-main/.claude/skills/shopify/' },
  // devops -> backend, fullstack, devops
  { artifact_type: 'skill', basename: 'devops',
    path: 'claudekit-engineer-main/.claude/skills/devops/' },
  // aesthetic -> frontend, fullstack, mobile
  { artifact_type: 'skill', basename: 'aesthetic',
    path: 'claudekit-engineer-main/.claude/skills/aesthetic/' },
  // media-processing -> frontend, fullstack, mobile, data-ai
  { artifact_type: 'skill', basename: 'media-processing',
    path: 'claudekit-engineer-main/.claude/skills/media-processing/' },
  // google-adk-python -> data-ai only
  { artifact_type: 'skill', basename: 'google-adk-python',
    path: 'claudekit-engineer-main/.claude/skills/google-adk-python/' },

  // ----- Commands -----
  // ask -> ALL 6
  { artifact_type: 'command', basename: 'ask',
    path: 'claudekit-engineer-main/.claude/commands/ask.md' },
  // integrate/polar -> backend, fullstack
  { artifact_type: 'command', basename: 'integrate/polar',
    path: 'claudekit-engineer-main/.claude/commands/integrate/polar.md' },
  // design/3d -> frontend, fullstack, mobile
  { artifact_type: 'command', basename: 'design/3d',
    path: 'claudekit-engineer-main/.claude/commands/design/3d.md' },

  // ----- Hooks with empty target_presets (merged at target) -----
  // discord_notify.sh -> [] (Req 7.2 — already merged into discord-notify tri-script)
  { artifact_type: 'hook', basename: 'discord_notify.sh',
    path: 'claudekit-engineer-main/.claude/hooks/discord_notify.sh' },
]);

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbAlnumChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
);
const arbToken = fc
  .array(arbAlnumChar, { minLength: 3, maxLength: 12 })
  .map((arr) => arr.join(''));

/**
 * Build a SourceItem từ a known template, gắn unique id để mọi item trong
 * mảng có id phân biệt (yêu cầu của DeltaDetector → uniqueness của output).
 *
 * @param {object} template
 * @param {string} unique
 * @returns {object}
 */
function buildKnownItem(template, unique) {
  const base = {
    id: `src.${template.artifact_type}.${template.basename}.${unique}`
      .replace(/\//g, '_'),
    kit: 'source',
    artifact_type: template.artifact_type,
    path: template.path,
    basename: template.basename,
    size_lines: 50,
  };
  if (template.artifact_type === 'skill') {
    base.extras = {
      is_sub_skill_container: false,
      subdirs: [],
      cross_platform_group: null,
      skill_md_path:
        template.path.replace(/\/$/, '') + '/SKILL.md',
    };
  }
  return base;
}

const arbKnownTemplate = fc.constantFrom(...KNOWN_TEMPLATES);

const arbKnownSourceItem = fc
  .tuple(arbKnownTemplate, arbToken)
  .map(([tpl, uniq]) => buildKnownItem(tpl, uniq));

const arbKnownInventory = fc
  .array(arbKnownSourceItem, { minLength: 1, maxLength: 8 })
  .map((items) => {
    // De-dup by id (cực hiếm nhưng có thể xảy ra với token collision).
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

/**
 * Build a "no-rule" SourceItem: artifact có path POSIX hợp lệ nhưng basename
 * KHÔNG xuất hiện trong CATEGORY_RULES. Dùng cho test 3d.
 *
 * Strategy: dùng artifact_type='agent' với token random (3..12 alnum) khó
 * trùng với 16 agent thật. Sau khi build, filter ngoại lệ ở fc.assert level.
 */
const arbNoRuleSourceItem = fc
  .tuple(arbToken, arbToken)
  .map(([name, uniq]) => ({
    id: `src.unknown.${name}.${uniq}`,
    kit: 'source',
    artifact_type: 'agent',
    path: `claudekit-engineer-main/.claude/agents/zzz-${name}-unk-${uniq}.md`,
    size_lines: 30,
  }))
  .filter((item) => {
    const id = idOf(item);
    return id != null && lookupRule('agent', id) == null;
  });

const arbNoRuleInventory = fc
  .array(arbNoRuleSourceItem, { minLength: 1, maxLength: 6 })
  .map((items) => {
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

/**
 * Sinh target inventory ngẫu nhiên cho cả 7 preset, mỗi (item, preset) có
 * 50% chance "installed" (path đầy đủ) hoặc 50% "skipped" (không có path).
 *
 * Mục tiêu: trộn lẫn status pre-mapping {present, missing} để 3a có thể
 * khẳng định mapper KHÔNG flip status khi rule khớp. (`partial` không cần
 * thiết để chứng minh property này; coverage được đảm bảo qua P2.)
 */
const arbInstalled = fc.boolean();

const arbTargetInventoryFor = (items) =>
  fc
    .tuple(
      ...VALID_PRESETS.map(() =>
        fc.array(arbInstalled, {
          minLength: items.length,
          maxLength: items.length,
        }),
      ),
    )
    .map((modesPerPreset) => {
      /** @type {Record<string, Array<{ preset: string, path: string }>>} */
      const byPreset = Object.create(null);
      for (let pi = 0; pi < VALID_PRESETS.length; pi++) {
        const preset = VALID_PRESETS[pi];
        const modes = modesPerPreset[pi];
        const list = [];
        for (let ii = 0; ii < items.length; ii++) {
          if (!modes[ii]) continue;
          const item = items[ii];
          const PREFIX = 'claudekit-engineer-main/.claude/';
          const stripped = item.path.startsWith(PREFIX)
            ? item.path.slice(PREFIX.length)
            : item.path;

          if (item.artifact_type === 'skill') {
            const baseStripped = stripped.replace(/\/$/, '');
            const targetBase = joinPreset(preset, baseStripped);
            list.push({ preset, path: `${targetBase}/SKILL.md` });
          } else {
            list.push({ preset, path: joinPreset(preset, stripped) });
          }
        }
        byPreset[preset] = list;
      }
      return { byPreset };
    });

const arbKnownInputPair = arbKnownInventory.chain((source) =>
  arbTargetInventoryFor(source.items).map((target) => ({ source, target })),
);

const arbNoRuleInputPair = arbNoRuleInventory.chain((source) =>
  arbTargetInventoryFor(source.items).map((target) => ({ source, target })),
);

// ---------------------------------------------------------------------------
// Property assertions
// ---------------------------------------------------------------------------

describe('Property 3: Category Mapping Correctness — **Validates: Requirements 1.3, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.12, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4**', () => {
  it('3a: rule contains target_preset → status NEVER category-skip (preserved from detector)', () => {
    fc.assert(
      fc.property(arbKnownInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        const mapped = apply(deltas, source.items);

        // Map source_id -> SourceItem để lookup trong assert loop.
        const srcById = new Map(source.items.map((i) => [i.id, i]));

        // Map (source_id, target_preset) -> pre-mapping status.
        const preStatus = new Map();
        for (const d of deltas) {
          preStatus.set(`${d.source_id}\u0000${d.target_preset}`, d.status);
        }

        for (const e of mapped) {
          const item = srcById.get(e.source_id);
          if (!item) continue;
          const id = idOf(item);
          const targetPresets = lookupRule(item.artifact_type, id);
          if (!presetMatches(targetPresets, e.target_preset)) continue;

          // Rule contains preset → status MUST NOT be category-skip.
          expect(e.status).not.toBe('category-skip');
          expect(['present', 'missing', 'partial']).toContain(e.status);

          // Status đúng = status pre-mapping (CategoryMapper không flip
          // present/missing/partial khi rule khớp).
          const key = `${e.source_id}\u0000${e.target_preset}`;
          expect(e.status).toBe(preStatus.get(key));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('3b: rule does NOT contain target_preset → status = category-skip with non-empty reason matching categorySkipReason()', () => {
    fc.assert(
      fc.property(arbKnownInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        const mapped = apply(deltas, source.items);
        const srcById = new Map(source.items.map((i) => [i.id, i]));

        for (const e of mapped) {
          const item = srcById.get(e.source_id);
          if (!item) continue;
          const id = idOf(item);
          const targetPresets = lookupRule(item.artifact_type, id);
          if (presetMatches(targetPresets, e.target_preset)) continue;

          // Rule không match → MUST be category-skip.
          expect(e.status).toBe('category-skip');
          expect(typeof e.reason).toBe('string');
          expect(e.reason.length).toBeGreaterThan(0);
          // Reason deterministic theo categorySkipReason.
          expect(e.reason).toBe(categorySkipReason(targetPresets));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('3c: empty target_presets array → reason === "merged-into-tri-script"', () => {
    // Sanity: helper trả đúng label (không cần PBT).
    expect(categorySkipReason([])).toBe('merged-into-tri-script');

    // Property: với hook discord_notify.sh (target_presets === []), MỌI
    // entry mapped đều là category-skip với reason 'merged-into-tri-script'.
    fc.assert(
      fc.property(arbKnownInputPair, ({ source, target }) => {
        const mapped = apply(
          detect(source, { byPreset: target.byPreset }),
          source.items,
        );
        const srcById = new Map(source.items.map((i) => [i.id, i]));

        for (const e of mapped) {
          const item = srcById.get(e.source_id);
          if (!item) continue;
          const id = idOf(item);
          const tp = lookupRule(item.artifact_type, id);
          if (!Array.isArray(tp) || tp.length !== 0) continue;

          expect(e.status).toBe('category-skip');
          expect(e.reason).toBe('merged-into-tri-script');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('3d: artifact without rule → status = category-skip with reason "no-rule"', () => {
    fc.assert(
      fc.property(arbNoRuleInputPair, ({ source, target }) => {
        const mapped = apply(
          detect(source, { byPreset: target.byPreset }),
          source.items,
        );

        // Mọi entry đều fallback to no-rule (artifact thuộc inventory không
        // có entry CATEGORY_RULES).
        for (const e of mapped) {
          expect(e.status).toBe('category-skip');
          expect(e.reason).toBe('no-rule');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('3e: idempotency — apply(apply(deltas)) ≡ apply(deltas)', () => {
    fc.assert(
      fc.property(arbKnownInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        const once = apply(deltas, source.items);
        const twice = apply(once, source.items);

        expect(twice.length).toBe(once.length);
        for (let i = 0; i < once.length; i++) {
          expect(twice[i].status).toBe(once[i].status);
          // Reason ổn định: nếu category-skip, reason phải khớp.
          if (once[i].status === 'category-skip') {
            expect(twice[i].reason).toBe(once[i].reason);
          }
          expect(twice[i].source_id).toBe(once[i].source_id);
          expect(twice[i].target_preset).toBe(once[i].target_preset);
          expect(twice[i].target_path).toBe(once[i].target_path);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('3f: output.length === input.length and input is not mutated', () => {
    fc.assert(
      fc.property(arbKnownInputPair, ({ source, target }) => {
        const deltas = detect(source, { byPreset: target.byPreset });
        // Snapshot deep-cloned status + reason ở pre-mapping.
        const snapshot = deltas.map((d) => ({
          status: d.status,
          reason: d.reason,
          source_id: d.source_id,
          target_preset: d.target_preset,
        }));

        const mapped = apply(deltas, source.items);

        expect(mapped.length).toBe(deltas.length);

        // Input array không được mutate.
        for (let i = 0; i < deltas.length; i++) {
          expect(deltas[i].status).toBe(snapshot[i].status);
          expect(deltas[i].reason).toBe(snapshot[i].reason);
          expect(deltas[i].source_id).toBe(snapshot[i].source_id);
          expect(deltas[i].target_preset).toBe(snapshot[i].target_preset);
        }

        // Mapped phần tử là object mới (shallow copy) — không phải tham chiếu
        // tới input element. (Defensive — đảm bảo downstream stage có thể
        // mutate output an toàn nếu cần.)
        for (let i = 0; i < deltas.length; i++) {
          if (deltas[i] === undefined || mapped[i] === undefined) continue;
          expect(mapped[i]).not.toBe(deltas[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('sanity: KNOWN_TEMPLATES universe covers all 6 main presets via at least one rule', () => {
    // Defensive: nếu KNOWN_TEMPLATES bị edit rỗng / leak preset coverage,
    // các property test 3a/3b sẽ vô nghĩa. Test này fail-fast.
    const presetCoverage = new Set();
    for (const tpl of KNOWN_TEMPLATES) {
      const presets = lookupRule(tpl.artifact_type, tpl.basename);
      if (!Array.isArray(presets)) continue;
      for (const p of presets) presetCoverage.add(p);
    }
    for (const p of ALL_MAIN_PRESETS) {
      expect(presetCoverage.has(p)).toBe(true);
    }
    // CATEGORY_RULES không được rỗng (sanity import).
    expect(CATEGORY_RULES.length).toBeGreaterThan(0);
  });
});
