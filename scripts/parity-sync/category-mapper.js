/**
 * Category Mapper for the upstream kit Parity Sync.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 2 / 5.1, 5.2 — áp `CATEGORY_RULES` lên `DeltaEntry[]`, đổi
 *        status `present|missing|partial → category-skip` khi `target_preset`
 *        không nằm trong `rule.target_presets`; sinh reason string đi kèm.
 *
 * Trách nhiệm (design.md > Components and Interfaces > CategoryMapper):
 *   - Áp bảng CATEGORY_RULES (xem `category-rules.js`) để loại bỏ các pair
 *     không thuộc category của preset.
 *   - Đầu ra là tập (source_artifact, preset, status, reason) đã thu hẹp.
 *
 * Decision rules (cụ thể hoá Property 3):
 *   - `idOf(srcItem)` derive canonical lookup key; `lookupRule` trả về
 *     `target_presets: ReadonlyArray<string> | null`.
 *   - Rule null (không có entry trong CATEGORY_RULES — về lý thuyết không xảy
 *     ra do test 3.3 enforce no-orphan): defensive fallback → status =
 *     `category-skip`, reason = `no-rule`.
 *   - Rule khớp (`presetMatches(targetPresets, target_preset) === true`):
 *     giữ nguyên `status` và `reason` gốc (không bao giờ chuyển sang
 *     `category-skip` — Property 3 phía positive).
 *   - Rule không khớp: status = `category-skip`, reason =
 *     `categorySkipReason(targetPresets)` (Property 3 phía negative).
 *
 * Reason string strategy (task 5.2 — deterministic, ổn định cho diff):
 *   - `['frontend']`            → 'frontend-only'
 *   - `['backend']`             → 'backend-only'
 *   - `['frontend','fullstack']`→ 'frontend+fullstack-only'
 *   - `[]`                      → 'merged-into-tri-script'
 *                                 (đã merge ở target — ví dụ
 *                                 `discord_notify.sh` đã được hợp nhất vào
 *                                 `discord-notify.{js,sh,ps1}`, Req 7.2).
 *   - `null` / `undefined`      → 'no-rule' (fallback defensive).
 *
 * Pure functional — không I/O, không mutate input array.
 *
 * @example
 *   const { apply } = require('./category-mapper');
 *   const filtered = apply(deltas, sourceItems);
 *   // filtered: cùng độ dài deltas; entries không match category đã có
 *   //          status='category-skip' và reason chuỗi không rỗng.
 */

'use strict';

const { lookupRule, presetMatches, idOf } = require('./category-rules');

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Sinh reason string deterministic từ một mảng `target_presets`.
 *
 * Helper được export riêng để test unit, snapshot reporter, và để các stage
 * downstream (PortPlanner, Reporter) format thống nhất.
 *
 * @param {ReadonlyArray<string> | null | undefined} targetPresets
 *        Mảng preset trả về từ `lookupRule`. Có thể là `null` (không có rule),
 *        rỗng `[]` (rule có nhưng skip mọi preset), hoặc `string[]`.
 * @returns {string} Reason string không rỗng.
 *
 * @example
 *   categorySkipReason(['frontend'])             === 'frontend-only'
 *   categorySkipReason(['frontend', 'fullstack'])=== 'frontend+fullstack-only'
 *   categorySkipReason([])                       === 'merged-into-tri-script'
 *   categorySkipReason(null)                     === 'no-rule'
 */
function categorySkipReason(targetPresets) {
  if (targetPresets == null) return 'no-rule';
  if (!Array.isArray(targetPresets)) return 'no-rule';
  if (targetPresets.length === 0) return 'merged-into-tri-script';
  return `${targetPresets.join('+')}-only`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Áp `CATEGORY_RULES` lên một mảng `DeltaEntry[]`.
 *
 * Trả về một mảng MỚI có cùng độ dài; mỗi entry là một bản sao shallow của
 * delta gốc (không mutate input). Với mỗi entry:
 *   - Tìm SourceItem qua `source_id` (Map O(1)).
 *   - Derive `id = idOf(srcItem)` rồi `lookupRule(srcItem.artifact_type, id)`.
 *   - Áp decision rules theo file header.
 *
 * Edge cases:
 *   - Source item không tìm thấy: pass-through unchanged (defensive — không
 *     xảy ra với DeltaDetector hiện tại nhưng giữ output.length ổn định cho
 *     các stage downstream).
 *   - `idOf` trả về `null` (path không khớp pattern artifact_type): treat
 *     như rule null → category-skip với reason 'no-rule'.
 *   - `target_preset === '_template'`: `_template` không xuất hiện trong bất
 *     kỳ rule nào (Req 2.5 — skeleton, không phân phối tới end-user), nên
 *     mọi entry cho `_template` sẽ trở thành category-skip. Đây là behaviour
 *     mong muốn; PortPlanner downstream sẽ skip `category-skip` entries.
 *
 * @param {object[]} deltas Mảng `DeltaEntry` từ `DeltaDetector.detect`.
 * @param {object[]} sourceItems Mảng `SourceItem` từ `InventoryReader.readSource`.
 *        Cần thiết vì `DeltaEntry` chỉ có `source_id` chứ không có
 *        `artifact_type` / `path` (idOf cần cả hai).
 * @returns {object[]} Mảng `DeltaEntry` mới với status đã filter theo category.
 * @throws {TypeError} khi input không phải array.
 */
function apply(deltas, sourceItems) {
  if (!Array.isArray(deltas)) {
    throw new TypeError(
      'apply: deltas phải là array (output của DeltaDetector.detect).',
    );
  }
  if (!Array.isArray(sourceItems)) {
    throw new TypeError(
      'apply: sourceItems phải là array (output của InventoryReader.readSource().items).',
    );
  }

  // Build O(1) lookup. Skip entries không có id hợp lệ (defensive — readSource
  // đã reject các entry như vậy ở stage 2).
  /** @type {Map<string, object>} */
  const sourceById = new Map();
  for (const item of sourceItems) {
    if (item && typeof item === 'object' && typeof item.id === 'string') {
      sourceById.set(item.id, item);
    }
  }

  /** @type {object[]} */
  const out = new Array(deltas.length);

  for (let i = 0; i < deltas.length; i++) {
    const d = deltas[i];

    // Defensive: malformed delta entry → pass-through (giữ độ dài array).
    if (!d || typeof d !== 'object') {
      out[i] = d;
      continue;
    }

    const srcItem = sourceById.get(d.source_id);
    if (!srcItem) {
      // Defensive — không xảy ra với DeltaDetector hiện tại.
      out[i] = { ...d };
      continue;
    }

    const id = idOf(srcItem);
    const targetPresets = id == null
      ? null
      : lookupRule(srcItem.artifact_type, id);

    if (targetPresets != null && presetMatches(targetPresets, d.target_preset)) {
      // Match: keep status + reason gốc (Property 3 phía positive — không
      // bao giờ overwrite present/missing/partial bằng category-skip).
      out[i] = { ...d };
      continue;
    }

    // Không match (hoặc không có rule): chuyển sang category-skip.
    // Spread d trước rồi overwrite status + reason — kể cả khi delta gốc đã
    // có reason (ví dụ partial 'missing-subdir-references'), reason mới sẽ
    // ghi đè để giữ contract Property 3 (reason cho category-skip mô tả lý
    // do skip, không phải lý do partial).
    out[i] = {
      ...d,
      status: 'category-skip',
      reason: categorySkipReason(targetPresets),
    };
  }

  return out;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  apply,
  categorySkipReason,
};
