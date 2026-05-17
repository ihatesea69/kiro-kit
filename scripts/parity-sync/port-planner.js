/**
 * Port Planner for ClaudeKit Parity Sync.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 2 / 6.1, 6.2, 6.3, 6.4, 6.5, 6.6 — convert filtered
 *        `DeltaEntry[]` thành `PortPlan[]` mô tả I/O cụ thể.
 *
 * Trách nhiệm (design.md > Components and Interfaces > PortPlanner):
 *   - Iterate deltas with status ∈ {missing, partial}; skip {present, category-skip}.
 *   - Cho mỗi delta, derive transforms list dựa trên artifact_type và properties:
 *     * `rebrand`           — mọi text file (.md, .json, .js, .sh, .ps1, .py)
 *                             và mọi skill folder (chứa text files bên trong).
 *     * `frontmatter-keep`  — .md có YAML front-matter (agents, commands,
 *                             skills' SKILL.md, steering, workflows).
 *     * `sub-skill-split`   — `extras.is_sub_skill_container === true` →
 *                             mỗi sub-skill phát sinh một PortPlan riêng.
 *     * `tri-script-extend` — hook `.sh` không có cross_platform_group →
 *                             phát thêm target paths `.js` và `.ps1`.
 *     * `json-merge`        — settings.json / metadata.json / .mcp.json.example.
 *     * `env-merge`         — `.env.example` (basename match, mọi nơi).
 *
 * Per Req 7.2: nếu KiroKit đã có tri-script tương đương (`discord-notify.{js,sh,ps1}`
 * cho `discord_notify.sh`), CATEGORY_RULES đã trả về `[]` (NO_PRESET) nên
 * delta đã trở thành `category-skip` và không vào planner. Branch tri-script
 * vẫn được encode defensively.
 *
 * Pure CommonJS, NO I/O. Planner chỉ compute plans dựa trên delta + source
 * metadata; Porter (task 10) chịu trách nhiệm enumeration files trong skill
 * subtree và ghi disk.
 *
 * @example
 *   const { plan, transformsFor } = require('./port-planner');
 *   const plans = plan(filteredDeltas, sourceItems);
 *   // plans: [{ source_path, target_paths, transforms, artifact_type,
 *   //          target_preset, source_id }, ...]
 */

'use strict';

const { joinPreset } = require('./lib/path-utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * File extensions considered "text" cho mục đích rebrand. Per design.md
 * Components > PortPlanner > rebrand bullet.
 *
 * @type {ReadonlyArray<string>}
 */
const TEXT_EXTS = Object.freeze(['.md', '.json', '.js', '.sh', '.ps1', '.py']);

/**
 * Basenames eligible cho `json-merge` transform. Per design.md task 6.5:
 * settings.json / metadata.json / .mcp.json.example. Note: `manifest.json`
 * KHÔNG có trong source kit (KiroKit-only) nên không include.
 *
 * @type {ReadonlyArray<string>}
 */
const JSON_MERGE_BASENAMES = Object.freeze([
  'settings.json',
  'metadata.json',
  '.mcp.json.example',
]);

/**
 * Artifact types luôn được coi là có front-matter (per design.md
 * "frontmatter-keep" bullet). Các type khác (ví dụ docs_template) check qua
 * `srcItem.front_matter.present`.
 *
 * @type {ReadonlyArray<string>}
 */
const FRONTMATTER_TYPES = Object.freeze(['agent', 'command', 'skill', 'workflow']);

// Set của valid Transform values để runtime defensive check (không export
// vì Transform enum nằm trong design.md, không phải public API).
const VALID_TRANSFORMS = Object.freeze([
  'rebrand',
  'frontmatter-keep',
  'sub-skill-split',
  'tri-script-extend',
  'json-merge',
  'env-merge',
]);

// ---------------------------------------------------------------------------
// Path helpers (private)
// ---------------------------------------------------------------------------

/**
 * Trả về extension (kèm dấu chấm) của path POSIX. Ví dụ
 * `getExt('foo/bar.md') === '.md'`. Trả về `''` nếu không có ext hoặc path
 * kết thúc bằng `/`.
 *
 * @param {string} p
 * @returns {string}
 */
function getExt(p) {
  if (typeof p !== 'string' || p === '' || p.endsWith('/')) return '';
  const m = /\.[^./]+$/.exec(p);
  return m ? m[0] : '';
}

/**
 * Trả về basename POSIX, strip trailing slash trước khi tách. Ví dụ:
 *   - `getBasename('skills/foo/SKILL.md')` → `'SKILL.md'`
 *   - `getBasename('skills/document-skills/')` → `'document-skills'`
 *   - `getBasename('.env.example')` → `'.env.example'`
 *
 * @param {string} p
 * @returns {string}
 */
function getBasename(p) {
  if (typeof p !== 'string' || p === '') return '';
  const stripped = p.replace(/\/+$/, '');
  const idx = stripped.lastIndexOf('/');
  return idx === -1 ? stripped : stripped.slice(idx + 1);
}

// ---------------------------------------------------------------------------
// Predicates (private)
// ---------------------------------------------------------------------------

function isTextFile(p) {
  return TEXT_EXTS.includes(getExt(p));
}

function isSubSkillContainer(srcItem) {
  return Boolean(
    srcItem
    && srcItem.extras
    && srcItem.extras.is_sub_skill_container === true,
  );
}

/**
 * Hook source `.sh` chưa có biến thể `.js`/`.ps1` cùng nhóm.
 *
 * Detection criteria (defensive):
 *   - artifact_type === 'hook'
 *   - extension === '.sh'
 *   - extras.cross_platform_group ∈ {null, undefined} (không thuộc nhóm
 *     tri-script đã đầy đủ).
 *
 * Trong dữ liệu thực, các hook source `.sh` không có nhóm là
 * `discord_notify.sh`, `telegram_notify.sh`, `send-discord.sh`. Cả ba đều
 * đã được KiroKit hợp nhất vào `discord-notify.{js,sh,ps1}` /
 * `telegram-notify.{js,sh,ps1}` (Req 7.2) nên category-rules trả NO_PRESET
 * và CategoryMapper đã đổi status thành `category-skip` trước khi tới
 * planner. Logic này chỉ kích hoạt nếu (defensively) một delta `missing`
 * vẫn lọt qua.
 *
 * @param {object} srcItem
 * @returns {boolean}
 */
function isShOnlyHook(srcItem) {
  if (!srcItem || srcItem.artifact_type !== 'hook') return false;
  if (getExt(srcItem.path || '') !== '.sh') return false;
  const group = srcItem.extras ? srcItem.extras.cross_platform_group : null;
  return group == null;
}

function isJsonMerge(srcItem) {
  if (!srcItem || typeof srcItem.path !== 'string') return false;
  return JSON_MERGE_BASENAMES.includes(getBasename(srcItem.path));
}

function isEnvMerge(srcItem) {
  if (!srcItem || typeof srcItem.path !== 'string') return false;
  return getBasename(srcItem.path) === '.env.example';
}

/**
 * Kiểm tra source có front-matter cần được preserve không.
 *
 * Logic (per design.md "frontmatter-keep" bullet):
 *   - Nếu artifact_type ∈ FRONTMATTER_TYPES (agent/command/skill/workflow):
 *     true (skill folder → SKILL.md bên trong có FM).
 *   - Còn lại (docs_template, ...): check `srcItem.front_matter.present`.
 *
 * Không bao giờ áp cho non-`.md` (statusline/.sh/.json) — kiểm tra ext
 * trước.
 *
 * @param {object} srcItem
 * @returns {boolean}
 */
function shouldKeepFrontmatter(srcItem) {
  if (!srcItem) return false;
  const type = srcItem.artifact_type;
  const ext = getExt(srcItem.path || '');

  // Skill là folder (path kết thúc `/`) — ext rỗng nhưng vẫn cần keep FM
  // (SKILL.md bên trong). Các type khác phải là `.md`.
  if (type === 'skill') return true;
  if (ext !== '.md') return false;

  if (FRONTMATTER_TYPES.includes(type)) return true;
  return Boolean(
    srcItem.front_matter && srcItem.front_matter.present === true,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure helper: derive transforms list cho một SourceItem.
 *
 * Side-effect-free, useful for testing in isolation. Output là mảng MỚI mỗi
 * lần gọi (không cache).
 *
 * Order ổn định (cho diff snapshot tests): `rebrand`, `frontmatter-keep`,
 * `sub-skill-split`, `tri-script-extend`, `json-merge`, `env-merge`.
 *
 * @param {object} srcItem
 * @returns {string[]} Mảng các Transform value.
 */
function transformsFor(srcItem) {
  /** @type {string[]} */
  const transforms = [];
  if (!srcItem || typeof srcItem !== 'object') return transforms;

  const path = typeof srcItem.path === 'string' ? srcItem.path : '';
  const artifactType = srcItem.artifact_type;

  // 1. Rebrand: text files (per ext) OR skill containers (folder, processed
  //    file-by-file by Porter; mọi file con sẽ là text).
  if (isTextFile(path) || artifactType === 'skill') {
    transforms.push('rebrand');
  }

  // 2. Frontmatter-keep: .md với YAML FM (per FRONTMATTER_TYPES + skill folder).
  if (shouldKeepFrontmatter(srcItem)) {
    transforms.push('frontmatter-keep');
  }

  // 3. Sub-skill-split: container có 4 sub-skill (document-skills/{docx,pdf,
  //    pptx,xlsx}/). Planner sẽ phát nhiều PortPlan ở `plan()` nhưng transform
  //    flag vẫn được set trên mỗi plan để Porter biết đây là split unit.
  if (isSubSkillContainer(srcItem)) {
    transforms.push('sub-skill-split');
  }

  // 4. Tri-script-extend: defensive cho `.sh`-only hook (Req 7.2 — thường đã
  //    bị CategoryMapper loại bằng NO_PRESET rule).
  if (isShOnlyHook(srcItem)) {
    transforms.push('tri-script-extend');
  }

  // 5. Json-merge: settings.json / metadata.json / .mcp.json.example.
  if (isJsonMerge(srcItem)) {
    transforms.push('json-merge');
  }

  // 6. Env-merge: .env.example.
  if (isEnvMerge(srcItem)) {
    transforms.push('env-merge');
  }

  return transforms;
}

/**
 * Build target paths cho một delta trong trường hợp tri-script-extend.
 *
 * Source `.sh` -> emit cả ba biến thể `.sh`, `.js`, `.ps1` ở target. Order
 * deterministic: [sh, js, ps1] (giữ source ext đầu để Porter dễ trace).
 *
 * @param {string} shTargetPath POSIX path kết thúc `.sh`.
 * @returns {string[]}
 */
function expandTriScriptTargets(shTargetPath) {
  const stem = shTargetPath.slice(0, -'.sh'.length);
  return [shTargetPath, `${stem}.js`, `${stem}.ps1`];
}

/**
 * Build PortPlan cho mỗi sub-skill subdir của một container.
 *
 * Per design.md task 6.2: nếu source là `skills/document-skills/` với
 * `extras.subdirs = ['docx', 'pdf', 'pptx', 'xlsx']`, planner phát 4
 * PortPlan, mỗi plan có:
 *   - `source_path = "skills/document-skills/<subdir>/"`
 *   - `target_paths = ["presets/<P>/skills/document-skills/<subdir>/"]`
 *   - `transforms = [...baseTransforms]` (bao gồm 'sub-skill-split').
 *
 * @param {object} delta DeltaEntry với status missing|partial.
 * @param {object} srcItem SourceItem cho sub-skill container.
 * @param {string[]} baseTransforms Output của `transformsFor(srcItem)`.
 * @returns {object[]}
 */
function buildSubSkillPlans(delta, srcItem, baseTransforms) {
  const subdirs = (srcItem.extras && Array.isArray(srcItem.extras.subdirs))
    ? srcItem.extras.subdirs
    : [];

  if (subdirs.length === 0) {
    // Defensive: container không có subdirs → fallback một plan single với
    // transforms gốc. Trong dữ liệu thực, document-skills luôn có 4 subdirs.
    return [
      {
        source_path: delta.source_path,
        target_paths: [delta.target_path],
        transforms: baseTransforms.slice(),
        artifact_type: srcItem.artifact_type,
        target_preset: delta.target_preset,
        source_id: delta.source_id,
      },
    ];
  }

  const containerSrc = delta.source_path.replace(/\/+$/, '');
  /** @type {object[]} */
  const out = [];

  for (const subdir of subdirs) {
    const subSrcPath = `${containerSrc}/${subdir}/`;
    // joinPreset normalize trailing slash; thêm lại để giữ semantic "directory".
    const subTargetPath = `${joinPreset(delta.target_preset, subSrcPath)}/`;
    out.push({
      source_path: subSrcPath,
      target_paths: [subTargetPath],
      transforms: baseTransforms.slice(),
      artifact_type: srcItem.artifact_type,
      target_preset: delta.target_preset,
      source_id: delta.source_id,
    });
  }
  return out;
}

/**
 * Convert một mảng `DeltaEntry[]` (đã filter bởi CategoryMapper) thành mảng
 * `PortPlan[]` mô tả thao tác I/O cụ thể.
 *
 * Skip semantics:
 *   - status === 'present'        → no-op (file đã có ở target).
 *   - status === 'category-skip'  → no-op (không thuộc category preset).
 *   - status ∈ {'missing','partial'} → emit plan(s).
 *
 * Output ordering theo input order (stable). Mỗi sub-skill container phát
 * `subdirs.length` plans (4 cho document-skills); tri-script-extend không
 * tăng số plans (chỉ tăng target_paths trong cùng một plan).
 *
 * @param {object[]} deltas DeltaEntry[] từ CategoryMapper.
 * @param {object[]} sourceItems SourceItem[] từ InventoryReader (cần cho
 *        artifact_type/extras lookup).
 * @returns {object[]} PortPlan[]
 * @throws {TypeError} khi input không phải array.
 */
function plan(deltas, sourceItems) {
  if (!Array.isArray(deltas)) {
    throw new TypeError(
      'plan: deltas phải là array (output của CategoryMapper.apply).',
    );
  }
  if (!Array.isArray(sourceItems)) {
    throw new TypeError(
      'plan: sourceItems phải là array (output của InventoryReader.readSource().items).',
    );
  }

  // Build O(1) source lookup map.
  /** @type {Map<string, object>} */
  const sourceById = new Map();
  for (const item of sourceItems) {
    if (item && typeof item === 'object' && typeof item.id === 'string') {
      sourceById.set(item.id, item);
    }
  }

  /** @type {object[]} */
  const plans = [];

  for (const delta of deltas) {
    if (!delta || typeof delta !== 'object') continue;
    if (delta.status !== 'missing' && delta.status !== 'partial') continue;

    const srcItem = sourceById.get(delta.source_id);
    if (!srcItem) {
      // Defensive — không xảy ra với DeltaDetector hiện tại; skip để giữ
      // output nhất quán.
      continue;
    }

    const baseTransforms = transformsFor(srcItem);

    // Sub-skill-split: phát nhiều plans, mỗi plan cho một sub-skill subdir.
    if (isSubSkillContainer(srcItem)) {
      const subPlans = buildSubSkillPlans(delta, srcItem, baseTransforms);
      for (const sp of subPlans) plans.push(sp);
      continue;
    }

    // Tri-script-extend: emit `.js` + `.ps1` paths ngoài `.sh` source.
    let targetPaths;
    if (isShOnlyHook(srcItem) && delta.target_path.endsWith('.sh')) {
      targetPaths = expandTriScriptTargets(delta.target_path);
    } else {
      targetPaths = [delta.target_path];
    }

    plans.push({
      source_path: delta.source_path,
      target_paths: targetPaths,
      transforms: baseTransforms,
      artifact_type: srcItem.artifact_type,
      target_preset: delta.target_preset,
      source_id: delta.source_id,
    });
  }

  return plans;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  plan,
  transformsFor,
  // Exposed cho test (task 6.7) và future stages.
  TEXT_EXTS,
  JSON_MERGE_BASENAMES,
  FRONTMATTER_TYPES,
  VALID_TRANSFORMS,
};
