/**
 * Delta Detector for ClaudeKit Parity Sync.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 2 / 4.1, 4.2 — pairwise compare mỗi source artifact với mỗi
 *        preset target, sinh DeltaEntry với status `present|missing|partial`
 *        (chưa áp category — CategoryMapper ở task 5 mới đổi thành
 *        `category-skip`).
 *
 * Trách nhiệm (design.md > Components and Interfaces > DeltaDetector):
 *   - Với mỗi srcItem × mỗi preset trong VALID_PRESETS (6 chính + `_template`):
 *     - Strip prefix `claudekit-engineer-main/.claude/` → relPath.
 *     - target_path = `presets/<preset>/<relPath>` (POSIX style).
 *     - Non-skill artifact: kiểm tra trực tiếp set membership.
 *     - Skill artifact (folder): check sự tồn tại của `<target_path>/SKILL.md`
 *       (hoặc bất kỳ path con nào với sub-skill container không có SKILL.md);
 *       nếu present, sub-check: thiếu `references/` hoặc `scripts/` → partial.
 *
 * Output `DeltaEntry[]` có đúng `srcItems.length × VALID_PRESETS.length` entry,
 * mỗi cặp (source_id, target_preset) duy nhất một status (Property 2).
 *
 * Pure functional — không I/O, không state ngoài input/output. CategoryMapper
 * (task 5) chịu trách nhiệm đổi `missing → category-skip` khi preset không match
 * `CATEGORY_RULES`. Reporter (task 12) chịu trách nhiệm sort + format.
 *
 * @example
 *   const { detect } = require('./delta-detector');
 *   const deltas = detect(
 *     { items: srcItems },
 *     { byPreset: { frontend: [...], ... } }
 *   );
 *   // deltas: [{ source_id, source_path, target_preset, target_path,
 *   //           status, reason?, source_lines, target_lines? }, ...]
 */

'use strict';

const {
  VALID_PRESETS,
  stripClaudePrefix,
  joinPreset,
} = require('./lib/path-utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Subdir thuộc skill folder mà thiếu sẽ kích hoạt status `partial` theo design
 * "Logic detect partial cho skill thiếu references/ hoặc scripts/".
 *
 * Các subdir khác (`assets/`, `templates/`, ...) KHÔNG kích hoạt partial — chỉ
 * cần SKILL.md tồn tại là đủ coi như `present` về mặt skill structure.
 *
 * @type {ReadonlyArray<string>}
 */
const RELEVANT_SKILL_SUBDIRS = Object.freeze(['references', 'scripts']);

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/**
 * Build per-preset Set<string> từ targetInventory. O(N) per preset; lookup O(1).
 *
 * @param {{ byPreset: Record<string, Array<{ path: string }>> }} targetInventory
 * @returns {Record<string, Set<string>>}
 */
function buildTargetSets(targetInventory) {
  /** @type {Record<string, Set<string>>} */
  const out = Object.create(null);
  for (const preset of VALID_PRESETS) {
    const items = targetInventory.byPreset[preset];
    const set = new Set();
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && typeof item.path === 'string') {
          set.add(item.path);
        }
      }
    }
    out[preset] = set;
  }
  return out;
}

/**
 * Trả về true nếu set có ít nhất một path bắt đầu bằng `prefix`.
 *
 * Linear scan O(N). N ≤ ~150 paths/preset ở dữ liệu thực; PBT generators dùng
 * input nhỏ hơn nữa nên không cần index hoá.
 *
 * @param {Set<string>} set
 * @param {string} prefix
 * @returns {boolean}
 */
function hasPrefixedPath(set, prefix) {
  for (const p of set) {
    if (p.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Tính danh sách relevant subdirs (`references`, `scripts`) source có nhưng
 * target thiếu. Duy trì thứ tự RELEVANT_SKILL_SUBDIRS để reason string ổn định.
 *
 * @param {{ extras?: { subdirs?: string[] } }} srcItem
 * @param {string} targetBase POSIX path không trailing slash, e.g.
 *        "presets/frontend/skills/aesthetic".
 * @param {Set<string>} targetSet
 * @returns {string[]} subset của RELEVANT_SKILL_SUBDIRS.
 */
function computeMissingSkillSubdirs(srcItem, targetBase, targetSet) {
  const subdirs =
    srcItem && srcItem.extras && Array.isArray(srcItem.extras.subdirs)
      ? srcItem.extras.subdirs
      : [];
  /** @type {string[]} */
  const missing = [];
  for (const subdir of RELEVANT_SKILL_SUBDIRS) {
    if (!subdirs.includes(subdir)) continue;
    const prefix = `${targetBase}/${subdir}/`;
    if (!hasPrefixedPath(targetSet, prefix)) {
      missing.push(subdir);
    }
  }
  return missing;
}

/**
 * Tính status cho một skill artifact (folder).
 *
 * Hai sub-trường hợp:
 *   1. Skill có SKILL.md (`extras.skill_md_path` truthy hoặc default behaviour):
 *      - Nếu target thiếu `<base>/SKILL.md` → missing.
 *      - Nếu có, check relevant subdirs → partial / present.
 *   2. Sub-skill container (`extras.is_sub_skill_container === true` hoặc
 *      `extras.skill_md_path === null`):
 *      - Không yêu cầu SKILL.md. Chỉ cần có bất kỳ path nào dưới
 *        `<base>/` → present; ngược lại → missing.
 *
 * @param {object} srcItem
 * @param {string} targetBase
 * @param {Set<string>} targetSet
 * @returns {{ status: 'present' | 'missing' | 'partial', reason?: string }}
 */
function classifySkill(srcItem, targetBase, targetSet) {
  const extras = srcItem.extras || {};
  const isSubSkillContainer = extras.is_sub_skill_container === true;
  const hasSourceSkillMd =
    !isSubSkillContainer
    && (extras.skill_md_path === undefined || extras.skill_md_path !== null);

  if (!hasSourceSkillMd) {
    // Container with no SKILL.md (e.g. document-skills/). Bất kỳ subtree
    // file nào tồn tại đều coi là present.
    const prefix = `${targetBase}/`;
    return hasPrefixedPath(targetSet, prefix)
      ? { status: 'present' }
      : { status: 'missing' };
  }

  const skillMdTarget = `${targetBase}/SKILL.md`;
  if (!targetSet.has(skillMdTarget)) {
    return { status: 'missing' };
  }

  const missing = computeMissingSkillSubdirs(srcItem, targetBase, targetSet);
  if (missing.length === 0) {
    return { status: 'present' };
  }
  return {
    status: 'partial',
    reason: `missing-subdir-${missing.join('-')}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pairwise compare mỗi source artifact với mỗi preset target.
 *
 * Output: mảng có đúng `sourceInventory.items.length × VALID_PRESETS.length`
 * entry. Mỗi entry là một `DeltaEntry`:
 * ```
 * {
 *   source_id: string,
 *   source_path: string,        // POSIX, đã strip prefix .claude/
 *   target_preset: PresetName,  // 6 chính + '_template'
 *   target_path: string,        // POSIX, "presets/<P>/<source_path>"
 *   status: 'present' | 'missing' | 'partial',
 *   reason?: string,            // chỉ với partial: "missing-subdir-references", ...
 *   source_lines: number,
 *   target_lines?: number       // chưa được set ở stage này (để Reporter điền)
 * }
 * ```
 *
 * Status `category-skip` KHÔNG được sinh ở stage này — đó là việc của
 * CategoryMapper (task 5) áp `CATEGORY_RULES` lên kết quả.
 *
 * @param {{ items: object[] }} sourceInventory
 * @param {{ byPreset: Record<string, Array<{ path: string }>> }} targetInventory
 * @returns {object[]} `DeltaEntry[]`
 * @throws {TypeError} khi input không đúng schema tối thiểu.
 */
function detect(sourceInventory, targetInventory) {
  if (
    !sourceInventory
    || typeof sourceInventory !== 'object'
    || !Array.isArray(sourceInventory.items)
  ) {
    throw new TypeError(
      'detect: sourceInventory.items phải là array (xem InventoryReader.readSource).',
    );
  }
  if (
    !targetInventory
    || typeof targetInventory !== 'object'
    || targetInventory.byPreset === null
    || typeof targetInventory.byPreset !== 'object'
  ) {
    throw new TypeError(
      'detect: targetInventory.byPreset phải là object (xem InventoryReader.readTarget).',
    );
  }

  const targetSets = buildTargetSets(targetInventory);

  /** @type {object[]} */
  const out = [];

  for (const srcItem of sourceInventory.items) {
    if (!srcItem || typeof srcItem !== 'object') continue;
    if (typeof srcItem.id !== 'string' || typeof srcItem.path !== 'string') continue;

    const sourcePath = stripClaudePrefix(srcItem.path);
    if (sourcePath === '') continue; // defense — path rỗng sau strip không hợp lệ.

    const sourceLines =
      typeof srcItem.size_lines === 'number' && Number.isFinite(srcItem.size_lines)
        ? srcItem.size_lines
        : 0;

    for (const preset of VALID_PRESETS) {
      const targetPath = joinPreset(preset, sourcePath);
      const set = targetSets[preset];

      /** @type {{ status: 'present' | 'missing' | 'partial', reason?: string }} */
      let result;
      if (srcItem.artifact_type === 'skill') {
        result = classifySkill(srcItem, targetPath, set);
      } else {
        // File-like artifact (agent / command / hook / workflow / statusline /
        // settings / metadata / mcp_template / env_example / docs_template).
        result = set.has(targetPath) ? { status: 'present' } : { status: 'missing' };
      }

      /** @type {object} */
      const entry = {
        source_id: srcItem.id,
        source_path: sourcePath,
        target_preset: preset,
        target_path: targetPath,
        status: result.status,
        source_lines: sourceLines,
      };
      if (result.reason) {
        entry.reason = result.reason;
      }
      out.push(entry);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  detect,
  // Exposed cho test (PBT P2 + future unit tests).
  RELEVANT_SKILL_SUBDIRS,
};
