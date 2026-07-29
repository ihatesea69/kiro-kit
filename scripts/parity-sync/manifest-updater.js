/**
 * Manifest Updater for the upstream kit Parity Sync.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 4 / 11.1–11.5 — append entries cho file mới với 3 field
 *        `source`, `target`, `type`; sort theo `target` ascending; atomic
 *        write qua AtomicWriter; validate (round-trip JSON, no orphan,
 *        no broken link); throw `E_MANIFEST_INVALID` hoặc
 *        `E_MANIFEST_NO_ORPHAN` với rollback portedFiles nếu fail; PBT
 *        Property 7 — Manifest Coverage and Closure.
 *
 * Trách nhiệm (design.md > Components and Interfaces > ManifestUpdater):
 *
 *   "Sau khi Porter xong cho một preset P, đọc presets/P/manifest.json,
 *    append entry cho mọi file mới được port, validate."
 *
 *   "Schema entry không thay đổi (Req 18.2). Chỉ thêm entry mới, không
 *    thêm field mới ở root."
 *
 *   "Ordering. Entries được sort theo `target` path ascending để mọi lần
 *    chạy sinh diff ổn định."
 *
 *   "Validate cuối cùng:
 *     - JSON.parse(JSON.stringify(manifest)) round-trip (Req 19.6).
 *     - Mọi entry có `source` phải trỏ đến file vật lý tồn tại (Req 19.7).
 *     - Mọi file vật lý trong preset (trừ manifest.json, README.md) phải
 *       có entry tương ứng (Req 13.3)."
 *
 * Schema deviation note (CRITICAL):
 *
 *   design.md > Data Models > Manifest mô tả shape lý thuyết với các field
 *   `kit_version`, `preset_version`, `entries`. Tuy nhiên các manifest hiện
 *   có trong presets/<P>/manifest.json dùng schema KiroKit-specific:
 *
 *     {
 *       "name": "<preset>",
 *       "version": "1.0.0",
 *       "description": "...",
 *       "category": "<preset>",
 *       "files": [
 *         { "source": "...", "target": "...", "type": "..." },
 *         ...
 *       ],
 *       "minCounts": { ... },
 *       "mcpServers": { ... },
 *       "hooks": { ... },
 *       "tags": [...]
 *     }
 *
 *   Bảng Files dùng key `files` (không phải `entries`). Mỗi entry có 3 field
 *   bắt buộc `source`, `target`, `type` cộng thêm field tuỳ chọn
 *   `executable` (boolean). ManifestUpdater giữ schema này nguyên vẹn —
 *   refactor toàn bộ presets/* sang shape design.md là out-of-scope của
 *   task 11. Mọi root-level field bổ sung (mcpServers, hooks, minCounts,
 *   tags, ...) đều được pass-through không sửa đổi.
 *
 *   Module này SCHEMA-TOLERANT: nếu manifest tương lai được migrate sang
 *   `entries`, helper `getEntries`/`setEntries` xử lý cả hai key (`files`
 *   ưu tiên vì là current state).
 *
 * Idempotency (Req 15.1, Property 10):
 *
 *   - Nếu `portedFiles` rỗng: append là no-op (entries giữ nguyên).
 *     Sub-task 11.2 sau đó re-sort + atomic-write — lần thứ hai chạy với
 *     cùng input cho ra cùng output (đã sort).
 *   - Nếu một ported file đã có entry cùng `source` trong manifest hiện có:
 *     skip (không tạo duplicate).
 *
 * Rollback (task 11.4, design.md > Error Handling > Error recovery):
 *
 *   Khi validate fail (sub-task 11.3/11.4), throw error
 *   `E_MANIFEST_INVALID` / `E_MANIFEST_NO_ORPHAN`. Caller (`run.js`) bắt
 *   error và xoá toàn bộ `portedFiles` cho preset (revert disk state).
 *   ManifestUpdater bản thân KHÔNG xoá file — separation of concerns:
 *   ManifestUpdater quản lý manifest.json, run.js quản lý transactional
 *   rollback giữa các stage.
 *
 *   Sub-task 11.1 (file này hiện implement): chỉ phần read + append. Các
 *   bước sort / atomic-write / validate / rollback được lo bởi
 *   sub-tasks 11.2-11.4.
 *
 * Pure CommonJS, sync I/O. Sub-task 11.2 sẽ wire AtomicWriter
 * (`./atomic-writer`) cho final write.
 *
 * @typedef {object} ManifestEntry
 * @property {string} source           Path relative to preset dir, e.g.
 *                                     "agents/brainstormer.md".
 * @property {string} target           Path workspace, e.g.
 *                                     ".kiro/agents/brainstormer.md".
 * @property {string} type             "agent" | "skill" | "command" | "hook"
 *                                     | "workflow" | "statusline" | "settings"
 *                                     | "metadata" | "doc" | "config" | "spec"
 *                                     | ... (free-form string; bộ giá trị
 *                                     hiện đang dùng trong 6 manifest tồn
 *                                     tại được liệt kê ở `KNOWN_TYPES`).
 *
 * @typedef {object} Manifest
 * @property {string} [name]
 * @property {string} [version]
 * @property {string} [description]
 * @property {string} [category]
 * @property {ManifestEntry[]} [files]      Schema KiroKit hiện hành.
 * @property {ManifestEntry[]} [entries]    Schema design.md (chưa dùng).
 * @property {object} [minCounts]
 * @property {object} [mcpServers]
 * @property {object} [hooks]
 * @property {string[]} [tags]
 *
 * @typedef {object} PortedFile
 * @property {string} source_path           POSIX-style, e.g.
 *                                          "agents/foo.md" hoặc
 *                                          "skills/bar/SKILL.md".
 * @property {string} target_path           POSIX-style, "presets/<P>/...".
 *                                          Có thể có hoặc không prefix
 *                                          "presets/<P>/" — helper sẽ
 *                                          strip để chuẩn hoá.
 * @property {string} target_preset         Preset name.
 * @property {string} [decision]            From ConflictResolver (optional).
 *
 * @typedef {object} AppendResult
 * @property {Manifest} manifest            Manifest đã merge (in-memory,
 *                                          chưa ghi đĩa — sub-task 11.2 ghi).
 * @property {ManifestEntry[]} appended     Entries thực sự được append (sau
 *                                          khi dedupe). Empty nếu mọi
 *                                          ported file đã có entry.
 * @property {string[]} skipped             Sources bỏ qua (vì đã có entry
 *                                          cùng `source`, hoặc decision
 *                                          không phải write).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { VALID_PRESETS, normalizeRelPath, toOsPath } = require('./lib/path-utils');
const { writeAtomic } = require('./atomic-writer');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Key trong manifest object chứa danh sách entries. Schema KiroKit hiện
 * hành dùng "files"; design.md mô tả "entries". Helper trong module này
 * chấp nhận cả hai để forward-compatible, nhưng khi append entry mới luôn
 * giữ nguyên key đang dùng (preserve schema — Req 18.2).
 *
 * Ưu tiên: "files" trước (vì mọi manifest hiện có dùng key này), fallback
 * "entries" nếu manifest tương lai migrate. Nếu manifest không có cả hai,
 * append vào "files" (default cho new manifest).
 *
 * @type {ReadonlyArray<string>}
 */
const ENTRY_LIST_KEYS = Object.freeze(['files', 'entries']);

/**
 * Tập "type" string đã thấy trong 6 manifest preset (frontend, backend,
 * fullstack, mobile, devops, data-ai) tại thời điểm task 11.1. Dùng cho
 * validation soft-warning khi append type không quen thuộc — KHÔNG reject
 * vì design.md/Req 13.1 cho phép enum mở-rộng (`docs`, `env-example`,
 * `spec-template`, ...). Frozen Set cho O(1) lookup.
 *
 * @type {ReadonlySet<string>}
 */
const KNOWN_TYPES = Object.freeze(
  new Set([
    'agent',
    'command',
    'config',
    'doc',
    'docs',
    'env',
    'env-example',
    'hook',
    'mcp',
    'metadata',
    'other',
    'settings',
    'skill',
    'spec',
    'spec-template',
    'statusline',
    'steering',
    'workflow',
  ]),
);

/**
 * Tên file manifest cho mỗi preset — không thay đổi (luôn `manifest.json`
 * theo Req 13.1).
 *
 * @type {string}
 */
const MANIFEST_BASENAME = 'manifest.json';

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

function assertString(value, paramName) {
  if (typeof value !== 'string') {
    throw new TypeError(
      `${paramName} phải là string, nhận được: ${value === null ? 'null' : typeof value}`,
    );
  }
}

/**
 * Tạo Error với `code` field gắn sẵn (cùng convention với `atomic-writer`).
 * `context` được merge vào error object để sub-task 11.4 có thể truyền
 * thêm `portedFiles` và caller có đủ data để rollback.
 *
 * @param {string} code
 * @param {string} message
 * @param {object} [context]
 * @returns {Error}
 */
function makeError(code, message, context) {
  const err = new Error(message);
  err.code = code;
  if (context && typeof context === 'object') {
    Object.assign(err, context);
  }
  return err;
}

/**
 * Validate preset name. Throw nếu không thuộc `VALID_PRESETS`.
 *
 * @param {string} preset
 */
function assertPreset(preset) {
  assertString(preset, 'preset');
  if (!VALID_PRESETS.includes(preset)) {
    throw new TypeError(
      `Preset không hợp lệ: "${preset}". Hợp lệ: ${VALID_PRESETS.join(', ')}.`,
    );
  }
}

/**
 * Resolve absolute OS path tới `presets/<preset>/manifest.json`.
 *
 * @param {string} preset
 * @param {string} workspaceRoot Absolute OS path tới workspace root.
 * @returns {string} OS-native absolute path.
 */
function manifestPathFor(preset, workspaceRoot) {
  return path.join(workspaceRoot, 'presets', preset, MANIFEST_BASENAME);
}

/**
 * Trả về tên key entries-list đang được manifest dùng. Ưu tiên key đã tồn
 * tại; nếu cả hai đều không có (manifest mới) trả về `'files'`. Đảm bảo
 * append KHÔNG đổi schema (Req 18.2): nếu manifest đang dùng `entries`,
 * append vẫn vào `entries`.
 *
 * @param {Manifest} manifest
 * @returns {string}
 */
function detectEntryListKey(manifest) {
  for (const key of ENTRY_LIST_KEYS) {
    if (Array.isArray(manifest[key])) return key;
  }
  // Default cho new manifest — khớp với toàn bộ 6 manifest hiện hành.
  return 'files';
}

/**
 * Trả về reference (không clone) tới mảng entries. Caller có thể mutate
 * — đây là pattern "in-place merge" cho append. Nếu manifest chưa có key
 * tương ứng, khởi tạo `[]` và gắn vào manifest.
 *
 * @param {Manifest} manifest
 * @param {string} key Đã được `detectEntryListKey` chọn.
 * @returns {ManifestEntry[]}
 */
function getOrCreateEntryList(manifest, key) {
  if (!Array.isArray(manifest[key])) {
    manifest[key] = [];
  }
  return manifest[key];
}

/**
 * Xác minh entry có shape hợp lệ tối thiểu cho schema KiroKit:
 *   - source: non-empty string.
 *   - target: non-empty string.
 *   - type:   non-empty string.
 *
 * Trả về `true` nếu valid, `false` nếu không. Dùng khi đọc manifest hiện
 * có để tolerant với entry malformed (sub-task 11.3 mới enforce strict).
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
function isValidEntryShape(entry) {
  return Boolean(
    entry
    && typeof entry === 'object'
    && typeof /** @type {ManifestEntry} */ (entry).source === 'string'
    && /** @type {ManifestEntry} */ (entry).source !== ''
    && typeof /** @type {ManifestEntry} */ (entry).target === 'string'
    && /** @type {ManifestEntry} */ (entry).target !== ''
    && typeof /** @type {ManifestEntry} */ (entry).type === 'string'
    && /** @type {ManifestEntry} */ (entry).type !== '',
  );
}

/**
 * Strip prefix `presets/<preset>/` khỏi POSIX target_path nếu có. Trả về
 * source path tương đối với preset dir — đây là format mọi entry trong
 * manifest hiện hành đang dùng (xem `presets/frontend/manifest.json`:
 * `"source": "agents/brainstormer.md"`).
 *
 * Idempotent: input đã ở dạng strip-ped trả về nguyên si.
 *
 * @param {string} targetPath POSIX-style.
 * @param {string} preset
 * @returns {string} POSIX-style relative path từ preset root.
 */
function toPresetRelative(targetPath, preset) {
  const normalized = normalizeRelPath(targetPath);
  const prefix = `presets/${preset}/`;
  if (normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length);
  }
  return normalized;
}

/**
 * Map một POSIX preset-relative source path sang `target` field cho
 * manifest entry — tức là path workspace người dùng (`.kiro/...`).
 *
 * Convention quan sát từ 6 manifest hiện có (xem `presets/frontend/
 * manifest.json`):
 *   - "agents/X.md"            -> ".kiro/agents/X.md"
 *   - "skills/X/SKILL.md"      -> ".kiro/skills/X/SKILL.md"
 *   - "commands/X.md"          -> ".kiro/commands/X.md"
 *   - "hooks/X.js"             -> ".kiro/hooks/X.js"
 *   - "workflows/X.md"         -> ".kiro/workflows/X.md"
 *   - "steering/X.md"          -> ".kiro/steering/X.md"
 *   - "statusline.{js,sh,ps1}" -> ".kiro/statusline.{js,sh,ps1}"
 *   - "settings.json"          -> ".kiro/settings/settings.json"
 *   - ".mcp.json.example"      -> ".kiro/settings/mcp.json.example"
 *   - ".env.example"           -> ".env.example"            (root, không
 *                                                            có prefix)
 *   - "specs/_templates/..."   -> ".kiro/specs/_templates/..."
 *   - "docs/X.md"              -> "docs/X.md"               (root)
 *
 * Mặc định: prepend ".kiro/" cho mọi path khác. Caller có thể override
 * bằng cách truyền `targetOverride` trong PortedFile (xem `appendPorted`).
 *
 * @param {string} presetRelative POSIX-style source (e.g., "agents/foo.md").
 * @returns {string} Workspace target path POSIX-style.
 */
function deriveDefaultTarget(presetRelative) {
  if (presetRelative === '.env.example') {
    return '.env.example';
  }
  if (presetRelative === '.mcp.json.example') {
    return '.kiro/settings/mcp.json.example';
  }
  if (presetRelative === 'settings.json') {
    return '.kiro/settings/settings.json';
  }
  if (presetRelative === 'metadata.json') {
    return '.kiro/metadata.json';
  }
  if (presetRelative.startsWith('docs/')) {
    return presetRelative;
  }
  return `.kiro/${presetRelative}`;
}

/**
 * Suy luận `type` field cho entry mới dựa trên path POSIX preset-relative.
 *
 * Logic ánh xạ với "Bảng phân loại" trong design.md và quan sát từ 6
 * manifest hiện có:
 *   - "agents/..."        -> "agent"
 *   - "skills/.../SKILL.md" -> "skill"
 *   - "skills/...md"      -> "doc" (README, INSTALLATION, ...)
 *   - "skills/.env.example" -> "config"
 *   - "commands/..."      -> "command"
 *   - "hooks/...js|sh|ps1"-> "hook"
 *   - "hooks/.env.example"-> "config"
 *   - "hooks/README.md"   -> "doc"
 *   - "workflows/..."     -> "workflow"
 *   - "steering/..."      -> "steering"
 *   - "statusline.*"      -> "config" (khớp manifest hiện hành — không
 *                            phải "statusline" dù enum có support; giữ
 *                            backward compat).
 *   - "settings.json"     -> "config"
 *   - "metadata.json"     -> "metadata"
 *   - ".mcp.json.example" -> "config"
 *   - ".env.example"      -> "config"
 *   - "specs/..."         -> "spec"
 *   - "docs/..."          -> "doc"
 *   - default             -> "other"
 *
 * Caller có thể override bằng cách set `type` trên PortedFile (xem
 * `appendPorted`).
 *
 * @param {string} presetRelative POSIX-style source.
 * @returns {string}
 */
function deriveTypeFromPath(presetRelative) {
  if (presetRelative.startsWith('agents/')) return 'agent';
  if (presetRelative.startsWith('skills/')) {
    if (presetRelative.endsWith('/SKILL.md')) return 'skill';
    if (presetRelative === 'skills/.env.example') return 'config';
    if (presetRelative.endsWith('.md')) return 'doc';
    return 'other';
  }
  if (presetRelative.startsWith('commands/')) return 'command';
  if (presetRelative.startsWith('hooks/')) {
    if (presetRelative === 'hooks/.env.example') return 'config';
    if (presetRelative === 'hooks/README.md') return 'doc';
    if (presetRelative.endsWith('.md')) return 'doc';
    return 'hook';
  }
  if (presetRelative.startsWith('workflows/')) return 'workflow';
  if (presetRelative.startsWith('steering/')) return 'steering';
  if (presetRelative.startsWith('statusline.')) return 'config';
  if (presetRelative === 'settings.json') return 'config';
  if (presetRelative === 'metadata.json') return 'metadata';
  if (presetRelative === '.mcp.json.example') return 'config';
  if (presetRelative === '.env.example') return 'config';
  if (presetRelative.startsWith('specs/')) return 'spec';
  if (presetRelative.startsWith('docs/')) return 'doc';
  return 'other';
}

// ---------------------------------------------------------------------------
// Public API — sub-task 11.1
// ---------------------------------------------------------------------------

/**
 * Đọc `presets/<preset>/manifest.json` và trả về parsed object.
 *
 * Hành vi:
 *   - Nếu manifest tồn tại: parse JSON, trả về Manifest object.
 *   - Nếu manifest không tồn tại (ENOENT): trả về skeleton tối thiểu
 *     `{ name: <preset>, version: '1.0.0', files: [] }` để caller có thể
 *     append entry rồi ghi mới (sub-task 11.2). Đây là behavior idempotent
 *     cho preset chưa có manifest — KHÔNG throw, vì task 11.1 phạm vi là
 *     "read + append", create-on-missing là extension hợp lý.
 *   - Nếu JSON malformed: throw `E_MANIFEST_INVALID` ngay (không tolerant
 *     — manifest hiện có malformed là lỗi maintainer cần fix thủ công,
 *     không phải lỗi parity-sync auto-recover).
 *
 * Schema KHÔNG được sửa đổi (Req 18.2): mọi field root (`name`, `version`,
 * `description`, `category`, `minCounts`, `mcpServers`, `hooks`, `tags`)
 * được pass-through nguyên vẹn.
 *
 * @param {string} preset Một trong `VALID_PRESETS`.
 * @param {object} [options]
 * @param {string} [options.workspaceRoot] Absolute OS path tới workspace
 *        root (chứa `presets/`). Mặc định = `process.cwd()`. Test harness
 *        truyền tmp dir để cô lập.
 * @returns {Manifest}
 * @throws {TypeError} preset không hợp lệ.
 * @throws {Error} `code === 'E_MANIFEST_INVALID'` nếu JSON parse fail.
 */
function readManifest(preset, options) {
  assertPreset(preset);
  const workspaceRoot = options && typeof options.workspaceRoot === 'string'
    ? options.workspaceRoot
    : process.cwd();

  const manifestPath = manifestPathFor(preset, workspaceRoot);

  /** @type {string} */
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // Skeleton mặc định cho preset chưa có manifest. Schema khớp với 6
      // manifest hiện hành (key `files`, không `entries`).
      return {
        name: preset,
        version: '1.0.0',
        category: preset,
        files: [],
      };
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw makeError(
        'E_MANIFEST_INVALID',
        `Manifest "${manifestPath}" parse được nhưng không phải object.`,
        { manifestPath, preset },
      );
    }
    return /** @type {Manifest} */ (parsed);
  } catch (err) {
    if (err && err.code === 'E_MANIFEST_INVALID') {
      throw err;
    }
    throw makeError(
      'E_MANIFEST_INVALID',
      `Không parse được manifest "${manifestPath}": ${err && err.message ? err.message : 'invalid JSON'}.`,
      { manifestPath, preset, cause: err },
    );
  }
}

/**
 * Build một `ManifestEntry` từ thông tin POSIX-style preset-relative.
 *
 * Bắt buộc 3 field theo Req 13.1: `source`, `target`, `type`. Nếu caller
 * không truyền `target` hoặc `type`, helper auto-derive từ `source`
 * (xem `deriveDefaultTarget`, `deriveTypeFromPath`).
 *
 * @param {object} input
 * @param {string} input.source       POSIX-style preset-relative path
 *                                    (e.g., "agents/foo.md") HOẶC POSIX
 *                                    target_path có prefix
 *                                    "presets/<preset>/" (sẽ được strip).
 * @param {string} input.preset       Preset name (cho strip prefix).
 * @param {string} [input.target]     Override default target derivation.
 * @param {string} [input.type]       Override default type derivation.
 * @param {boolean} [input.executable] Nếu truthy, gắn `executable: true`.
 * @returns {ManifestEntry}
 * @throws {TypeError} input shape không hợp lệ.
 */
function buildEntry(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildEntry: input phải là object.');
  }
  assertString(input.source, 'input.source');
  assertPreset(input.preset);

  const presetRelative = toPresetRelative(input.source, input.preset);
  if (presetRelative === '') {
    throw new TypeError(
      `buildEntry: source rỗng sau khi strip prefix "presets/${input.preset}/".`,
    );
  }

  const target = typeof input.target === 'string' && input.target !== ''
    ? normalizeRelPath(input.target)
    : deriveDefaultTarget(presetRelative);

  const type = typeof input.type === 'string' && input.type !== ''
    ? input.type
    : deriveTypeFromPath(presetRelative);

  /** @type {ManifestEntry} */
  const entry = {
    source: presetRelative,
    target,
    type,
  };

  // Field optional `executable` — pass-through để giữ parity với entries
  // hiện có (xem `presets/frontend/manifest.json`: hooks `.js` có
  // `"executable": true`). Schema không thay đổi vì đây là field per-entry
  // đã tồn tại sẵn, không phải field root mới.
  if (input.executable === true) {
    entry.executable = true;
  }

  return entry;
}

/**
 * Append một danh sách `PortedFile[]` vào `manifest.files` (hoặc
 * `manifest.entries`, tuỳ schema), giữ schema KHÔNG đổi (Req 18.2).
 *
 * Algorithm (sub-task 11.1):
 *   1. Detect entry-list key (`files` ưu tiên, fallback `entries`).
 *   2. Build set của `source` đã có trong manifest hiện tại để dedupe.
 *   3. Cho mỗi PortedFile:
 *        - Convert `source_path` → preset-relative POSIX.
 *        - Nếu đã có entry cùng `source`: skip (idempotent, Req 15.1).
 *        - Build entry với 3 field bắt buộc + optional `executable`.
 *        - Push vào entry list + tracking `appended`.
 *   4. Trả về `{ manifest, appended, skipped }` cho caller (sub-task 11.2
 *      sẽ sort + atomic write; sub-task 11.3 sẽ validate).
 *
 * Mutate manifest in-place: hành vi này khớp với pattern "read → mutate
 * → write" của file system pipeline trong cùng module (`atomic-writer`,
 * `porter`). Caller có thể clone trước nếu muốn tránh mutate (`structuredClone(manifest)`
 * hoặc `JSON.parse(JSON.stringify(manifest))`).
 *
 * KHÔNG sort entries trong sub-task 11.1 (sort là sub-task 11.2 — phân
 * tách rõ ràng để PR diff dễ review).
 *
 * @param {Manifest} manifest      Object trả từ `readManifest`.
 * @param {PortedFile[]} portedFiles
 * @param {object} options
 * @param {string} options.preset  Preset name (cho strip prefix khi build
 *                                 entry).
 * @returns {AppendResult}
 * @throws {TypeError} Input shape không hợp lệ.
 */
function appendPorted(manifest, portedFiles, options) {
  if (!manifest || typeof manifest !== 'object') {
    throw new TypeError('appendPorted: manifest phải là object (từ readManifest).');
  }
  if (!Array.isArray(portedFiles)) {
    throw new TypeError('appendPorted: portedFiles phải là array (PortedFile[]).');
  }
  if (!options || typeof options !== 'object') {
    throw new TypeError('appendPorted: options phải có ít nhất `preset`.');
  }
  assertPreset(options.preset);

  const key = detectEntryListKey(manifest);
  const list = getOrCreateEntryList(manifest, key);

  // Dedup index: tập `source` đã có. Chỉ index entry shape hợp lệ — entry
  // malformed (thiếu source) sẽ được sub-task 11.3 phát hiện và throw
  // E_MANIFEST_INVALID, không phải job của 11.1.
  /** @type {Set<string>} */
  const existingSources = new Set();
  for (const e of list) {
    if (isValidEntryShape(e)) {
      existingSources.add(/** @type {ManifestEntry} */ (e).source);
    }
  }

  /** @type {ManifestEntry[]} */
  const appended = [];
  /** @type {string[]} */
  const skipped = [];

  for (const ported of portedFiles) {
    if (!ported || typeof ported !== 'object') continue;

    // Ưu tiên `target_path` (Porter output) khi có, fallback `source_path`.
    // Cả hai đều là POSIX-style. Nếu cả hai missing → skip với warning
    // (defensive: caller không nên pass shape này, nhưng helpfully tolerant).
    const rawSource = typeof ported.target_path === 'string' && ported.target_path !== ''
      ? ported.target_path
      : (typeof ported.source_path === 'string' ? ported.source_path : '');
    if (rawSource === '') {
      continue;
    }

    /** @type {string} */
    let presetRelative;
    try {
      presetRelative = toPresetRelative(rawSource, options.preset);
    } catch (err) {
      // normalizeRelPath reject (absolute hoặc traversal) → skip + tracking.
      skipped.push(rawSource);
      continue;
    }

    if (presetRelative === '') {
      skipped.push(rawSource);
      continue;
    }

    if (existingSources.has(presetRelative)) {
      // Idempotency: ported file đã có entry — không tạo duplicate.
      skipped.push(presetRelative);
      continue;
    }

    const entry = buildEntry({
      source: presetRelative,
      preset: options.preset,
      target: typeof ported.target === 'string' ? ported.target : undefined,
      type: typeof ported.type === 'string' ? ported.type : undefined,
      executable: ported.executable === true,
    });

    list.push(entry);
    existingSources.add(entry.source);
    appended.push(entry);
  }

  return { manifest, appended, skipped };
}

/**
 * Convenience wrapper cho sub-task 11.1: read manifest + append entries
 * trong một call. KHÔNG ghi đĩa (sub-task 11.2 wire AtomicWriter).
 *
 * Pipeline integration (run.js task 13.x):
 *   const result = manifestUpdater.update(preset, portedFiles, { workspaceRoot });
 *   // sub-task 11.2: sort result.manifest[key] theo target ascending,
 *   //                writeAtomic(manifestPath, JSON.stringify(...)).
 *   // sub-task 11.3: validate round-trip + no-orphan + reachability.
 *   // sub-task 11.4: throw E_MANIFEST_* với context.portedFiles cho rollback.
 *
 * @param {string} preset
 * @param {PortedFile[]} portedFiles
 * @param {object} [options]
 * @param {string} [options.workspaceRoot]
 * @returns {AppendResult & { manifestPath: string }} `manifestPath` để
 *          sub-task 11.2 truyền vào `writeAtomic`.
 */
function update(preset, portedFiles, options) {
  assertPreset(preset);
  const workspaceRoot = options && typeof options.workspaceRoot === 'string'
    ? options.workspaceRoot
    : process.cwd();

  const manifest = readManifest(preset, { workspaceRoot });
  const result = appendPorted(manifest, portedFiles || [], { preset });

  return {
    manifest: result.manifest,
    appended: result.appended,
    skipped: result.skipped,
    manifestPath: manifestPathFor(preset, workspaceRoot),
  };
}

// ---------------------------------------------------------------------------
// Public API — sub-task 11.2 (sort + atomic write)
// ---------------------------------------------------------------------------

/**
 * JSON serialization indent — khớp 1:1 với 6 manifest hiện hành (xem
 * `presets/frontend/manifest.json` v.v., 2 spaces). Hằng số tách riêng để
 * test có thể assert chính xác output format.
 *
 * @type {number}
 */
const JSON_INDENT = 2;

/**
 * Trailing newline character cho output. Dùng `\n` (LF) bất kể OS — Git
 * trên Windows mặc định convert LF -> CRLF khi checkout (autocrlf=true),
 * nên repo source-of-truth giữ LF. JSON editors / formatters đều mong đợi
 * trailing newline ở EOF.
 *
 * @type {string}
 */
const TRAILING_NEWLINE = '\n';

/**
 * So sánh hai entry theo `target` field ascending. Dùng cho `Array.sort`
 * stable (ES2019+ guarantee `Array.prototype.sort` stable trên V8). Khi
 * `target` bằng nhau (xảy ra rất hiếm — cặp `source -> target` về lý
 * thuyết là 1:1 trong manifest hiện hành), trả về 0 để giữ nguyên thứ tự
 * input — đây là contract của stable sort.
 *
 * Entry malformed (thiếu `target` field) được đẩy về đầu mảng với key
 * empty string `''`. Sub-task 11.3 sẽ enforce strict validation và reject
 * manifest có entry malformed; ở đây chỉ cần sort tolerant để không crash.
 *
 * @param {ManifestEntry} a
 * @param {ManifestEntry} b
 * @returns {number}
 */
function compareByTarget(a, b) {
  const ta = typeof a.target === 'string' ? a.target : '';
  const tb = typeof b.target === 'string' ? b.target : '';
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

/**
 * Sort entry list trong manifest theo `target` ascending để diff ổn định
 * giữa các lần chạy (Req 19.6, Property 10 — Idempotency).
 *
 * Hành vi:
 *   - Mutate manifest in-place (cùng pattern với `appendPorted`).
 *   - Detect entry-list key (`files` ưu tiên, fallback `entries`) — Req 18.2:
 *     KHÔNG đổi schema, chỉ sort entries của key đang dùng.
 *   - Sort là stable (`Array.prototype.sort`, ES2019+) → entries cùng `target`
 *     giữ nguyên thứ tự input. Trong dataset hiện hành mọi `target` unique,
 *     nên stability chỉ là an toàn defensive.
 *   - Root-level fields (`name`, `version`, `description`, `category`,
 *     `mcpServers`, `hooks`, `tags`, `minCounts`, ...) KHÔNG bị reorder
 *     (chỉ entries array bị sort).
 *
 * @param {Manifest} manifest Object trả từ `readManifest` / `appendPorted`.
 * @returns {Manifest} Cùng object, mutated in-place. Trả về để chain.
 * @throws {TypeError} manifest không phải object.
 */
function sortEntries(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new TypeError('sortEntries: manifest phải là object (từ readManifest).');
  }

  const key = detectEntryListKey(manifest);
  // Lưu ý: nếu manifest chưa có key này (manifest mới chưa append entry
  // nào), `getOrCreateEntryList` sẽ tạo `[]`. Sort trên empty array là
  // no-op, an toàn.
  const list = getOrCreateEntryList(manifest, key);
  list.sort(compareByTarget);

  return manifest;
}

/**
 * Serialize manifest object thành JSON string với:
 *   - Indent 2 spaces (`JSON_INDENT`).
 *   - Trailing LF newline ở EOF (`TRAILING_NEWLINE`).
 *
 * Khớp với format của 6 manifest hiện hành (verify với `readFile` trên
 * `presets/frontend/manifest.json`: dùng 2-space indent, có trailing
 * newline). Lưu ý: 6 manifest source hiện ghi với CRLF do autocrlf trên
 * Windows checkout — module này luôn ghi LF nội bộ; Git filter sẽ
 * normalize lại CRLF khi commit nếu repo cấu hình vậy. Không phải
 * concern của parity-sync (Req 18.2 chỉ cấm thay đổi schema, không cấm
 * normalize line endings).
 *
 * Output luôn deterministic cho cùng input → support Property 10
 * (Idempotency): chạy lần 2 với cùng manifest cho ra cùng bytes.
 *
 * @param {Manifest} manifest
 * @returns {string} JSON string với trailing newline.
 * @throws {TypeError} manifest không phải object hoặc không serializable.
 */
function serialize(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new TypeError('serialize: manifest phải là object (từ readManifest).');
  }
  return JSON.stringify(manifest, null, JSON_INDENT) + TRAILING_NEWLINE;
}

/**
 * Commit kết quả `update` xuống đĩa: sort entries → serialize → atomic
 * write qua `atomic-writer.writeAtomic`. Đây là step ghi đĩa duy nhất
 * của ManifestUpdater (sub-task 11.1 chỉ build in-memory; 11.2 wire write).
 *
 * Pipeline integration (`run.js` task 13.x):
 *   const result = manifestUpdater.update(preset, portedFiles, { workspaceRoot });
 *   // sub-task 11.3: validate(result.manifest, { preset, workspaceRoot });
 *   manifestUpdater.commit(result);
 *
 * Behavior:
 *   - Sort entries in-place (mutate `result.manifest`).
 *   - Serialize → string với 2-space indent + trailing newline.
 *   - writeAtomic(`result.manifestPath`, content) — tmp + rename, retry
 *     trên Windows lock (xem `atomic-writer`).
 *   - Caller có thể truyền tuỳ chọn `manifestPathOverride` để redirect
 *     output (dùng cho smoke test / dry-run preview tới tmp dir mà không
 *     đụng presets/).
 *
 * Idempotency (Req 15.1, Property 10):
 *   - Sort + serialize là pure function của input manifest. Cùng manifest
 *     → cùng bytes → writeAtomic ghi cùng nội dung lên target → git diff
 *     trống ở lần chạy thứ hai.
 *
 * @param {object} updateResult Kết quả từ `update(preset, portedFiles, ...)`.
 * @param {Manifest} updateResult.manifest
 * @param {string} updateResult.manifestPath OS-native absolute path.
 * @param {object} [options]
 * @param {string} [options.manifestPathOverride] Override target path
 *        (dùng cho test / dry-run preview). Phải là OS-native absolute
 *        path. Nếu omit, dùng `updateResult.manifestPath`.
 * @returns {{ manifestPath: string, bytesWritten: number }} Stats để
 *          caller log progress.
 * @throws {TypeError} updateResult không hợp lệ.
 * @throws {Error} Bubble error từ `writeAtomic` (E_WRITE_LOCK, EROFS, ...).
 */
function commit(updateResult, options) {
  if (!updateResult || typeof updateResult !== 'object') {
    throw new TypeError(
      'commit: updateResult phải là object trả từ `update(preset, portedFiles)`.',
    );
  }
  if (!updateResult.manifest || typeof updateResult.manifest !== 'object') {
    throw new TypeError('commit: updateResult.manifest thiếu hoặc không phải object.');
  }

  const targetPath = options && typeof options.manifestPathOverride === 'string'
    && options.manifestPathOverride !== ''
    ? options.manifestPathOverride
    : updateResult.manifestPath;

  if (typeof targetPath !== 'string' || targetPath === '') {
    throw new TypeError(
      'commit: cần `manifestPath` (từ updateResult) hoặc options.manifestPathOverride.',
    );
  }

  sortEntries(updateResult.manifest);
  const content = serialize(updateResult.manifest);

  writeAtomic(targetPath, content);

  return {
    manifestPath: targetPath,
    bytesWritten: Buffer.byteLength(content, 'utf8'),
  };
}

// ---------------------------------------------------------------------------
// Public API — sub-task 11.3 (validate)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ValidationError
 * @property {'E_MANIFEST_INVALID'
 *           | 'E_MANIFEST_BROKEN_LINK'
 *           | 'E_MANIFEST_ORPHAN'} code
 * @property {string} message
 * @property {string} [path] POSIX preset-relative path liên quan (nếu có).
 *
 * @typedef {object} ValidationResult
 * @property {boolean} ok                 True khi `errors.length === 0`.
 * @property {ValidationError[]} errors   Tập lỗi tích luỹ — không throw.
 */

/**
 * File names được loại trừ khỏi orphan-check, theo design.md
 * "Validate cuối cùng":
 *
 *   "Mọi file vật lý trong preset (trừ `manifest.json`, `README.md`)
 *    phải có entry tương ứng (Req 13.3)."
 *
 * Lưu ý: chỉ `manifest.json` và `README.md` được skip — các dot-file khác
 * (`.env.example`, `.mcp.json.example`) BẮT BUỘC có entry trong manifest
 * và được tracking như mọi file thường (xem `presets/frontend/manifest.json`
 * có entry cho `.env.example`, `.mcp.json.example`).
 *
 * @type {ReadonlySet<string>}
 */
const ORPHAN_CHECK_EXEMPT = Object.freeze(new Set([
  MANIFEST_BASENAME,
  'README.md',
]));

/**
 * Tên thư mục được skip khi walk preset dir cho orphan-check. Defensive —
 * `presets/` không được chứa node_modules, nhưng nếu maintainer chạy
 * `npm install` ở trong preset dir vô tình, ta không muốn validate fail
 * vì hàng nghìn file trong node_modules.
 *
 * @type {ReadonlySet<string>}
 */
const WALK_SKIP_DIRS = Object.freeze(new Set(['node_modules']));

/**
 * Recursive deep equality cho cấu trúc manifest (string | number | boolean
 * | null | array | plain object). Đủ chính xác cho mục đích round-trip
 * detection — manifest schema không có Date, Map, Set, Symbol, BigInt
 * hợp lệ; nếu input chứa các giá trị non-serializable, JSON.stringify
 * sẽ drop chúng và `deepEqual(original, parsed)` trả về `false`, đó
 * chính là tín hiệu round-trip vi phạm (Req 19.6).
 *
 * Thuật toán:
 *   - Reference equal hoặc cả hai `null`: true.
 *   - typeof khác nhau: false.
 *   - Primitive: chỉ true khi `===` (đã check ở bước 1, fall-through false).
 *     Edge-case `NaN === NaN` là false — đúng hành vi mong muốn vì
 *     `JSON.stringify(NaN)` = "null", round-trip ra null, không match.
 *   - Array: same length + recursive on mỗi index.
 *   - Plain object: same own-key set + recursive on mỗi value.
 *
 * Không xử lý prototype chains (manifest chỉ chứa plain objects), không
 * follow Symbol keys (JSON ignores them anyway).
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;

  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;

  if (aIsArr) {
    /** @type {unknown[]} */
    const aa = /** @type {any} */ (a);
    /** @type {unknown[]} */
    const bb = /** @type {any} */ (b);
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i += 1) {
      if (!deepEqual(aa[i], bb[i])) return false;
    }
    return true;
  }

  const ao = /** @type {Record<string, unknown>} */ (a);
  const bo = /** @type {Record<string, unknown>} */ (b);
  const keysA = Object.keys(ao);
  const keysB = Object.keys(bo);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Walk `presetDir` (sync, recursive) và trả về mảng POSIX-style relative
 * path của mọi file (không thư mục).
 *
 * Skip:
 *   - Thư mục `node_modules` (xem `WALK_SKIP_DIRS`).
 *   - Symbolic link không được follow (mặc định của `readdirSync` —
 *     dirent.isFile/isDirectory check link target type).
 *
 * KHÔNG skip dot-files cấp file — `.env.example`, `.mcp.json.example`,
 * `.gitkeep` đều phải xuất hiện để orphan-check phát hiện đúng.
 *
 * Trả về `[]` nếu `presetDir` không tồn tại (ENOENT) — preset chưa được
 * scaffold thì không có file nào để check, hợp lệ.
 *
 * @param {string} presetDir Absolute OS path tới `presets/<preset>/`.
 * @param {string} [base]    Internal accumulator cho recursion (POSIX).
 * @returns {string[]} POSIX-style relative paths, ví dụ
 *                    `['agents/foo.md', 'skills/bar/SKILL.md']`. Không
 *                    sort — caller sort nếu cần output ổn định.
 */
function walkPresetFiles(presetDir, base) {
  const baseStr = typeof base === 'string' ? base : '';
  /** @type {string[]} */
  const result = [];

  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(presetDir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return result;
    }
    throw err;
  }

  for (const ent of entries) {
    const childPath = path.join(presetDir, ent.name);
    const relPath = baseStr === '' ? ent.name : `${baseStr}/${ent.name}`;

    if (ent.isDirectory()) {
      if (WALK_SKIP_DIRS.has(ent.name)) continue;
      result.push(...walkPresetFiles(childPath, relPath));
    } else if (ent.isFile()) {
      result.push(relPath);
    }
    // Sockets, FIFOs, devices: skip silently.
  }

  return result;
}

/**
 * Validate một manifest object (in-memory, sau khi append/sort) trên ba
 * invariant của design.md "Validate cuối cùng" + Property 7:
 *
 *   1. **Round-trip JSON** (Req 19.6): `JSON.parse(JSON.stringify(manifest))`
 *      phải bằng (deepEqual) `manifest`. Catch:
 *        - Non-serializable values (functions, undefined, BigInt, ...).
 *        - NaN/Infinity (stringify -> "null", round-trip diff).
 *        - Circular refs (stringify throws TypeError).
 *
 *   2. **No broken link** (Req 19.7): mọi `entry.source` phải trỏ đến
 *      file vật lý tồn tại tại `presets/<preset>/<source>` trên đĩa.
 *
 *   3. **No orphan** (Req 13.3): mọi file vật lý trong `presets/<preset>/`
 *      (recursive, trừ `manifest.json` và `README.md`) phải xuất hiện
 *      như `entry.source` của một entry nào đó.
 *
 * Hành vi:
 *   - KHÔNG throw cho lỗi validate — accumulate vào `errors` array. Caller
 *     (sub-task 11.4) sẽ wrap với throw + rollback portedFiles.
 *   - Vẫn throw `TypeError` cho input shape sai (manifest không phải
 *     object, options thiếu preset) — đó là lỗi lập trình, không phải
 *     lỗi validate runtime.
 *   - Round-trip check chạy đầu tiên; nếu fail vì stringify throw
 *     (circular ref / BigInt), trả về sớm với 1 error — không thể chạy
 *     check 2/3 với manifest broken. Nếu fail vì content diff (functions,
 *     undefined, NaN), tiếp tục check 2/3 với best-effort, dùng entries
 *     hiện có (vì những value broken trong entry hiếm gặp — schema chỉ
 *     có string).
 *
 * Idempotency: pure function của manifest + filesystem state. Cùng input
 * → cùng output. Không mutate manifest.
 *
 * @param {Manifest} manifest Object trả từ `readManifest` / `appendPorted`
 *                            (đã sort hoặc chưa — không quan trọng).
 * @param {object} options
 * @param {string} options.preset                Một trong `VALID_PRESETS`.
 * @param {string} [options.workspaceRoot]       Absolute OS path tới
 *                                               workspace root. Mặc định
 *                                               `process.cwd()`.
 * @returns {ValidationResult}
 * @throws {TypeError} Khi shape của `manifest` / `options` không hợp lệ.
 */
function validate(manifest, options) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('validate: manifest phải là object (từ readManifest).');
  }
  if (!options || typeof options !== 'object') {
    throw new TypeError('validate: options phải có ít nhất `preset`.');
  }
  assertPreset(options.preset);
  const workspaceRoot = typeof options.workspaceRoot === 'string'
    && options.workspaceRoot !== ''
    ? options.workspaceRoot
    : process.cwd();

  const presetDir = path.join(workspaceRoot, 'presets', options.preset);

  /** @type {ValidationError[]} */
  const errors = [];

  // -------------------------------------------------------------------------
  // Check 1: round-trip JSON.
  // -------------------------------------------------------------------------
  /** @type {string | undefined} */
  let serialized;
  try {
    serialized = JSON.stringify(manifest);
  } catch (err) {
    errors.push({
      code: 'E_MANIFEST_INVALID',
      message: `Manifest không serialize được (circular ref / BigInt / ...): ${err && err.message ? err.message : String(err)}`,
    });
    // Stringify failed catastrophically — không có gì để parse lại,
    // không thể chạy checks 2/3 trên manifest broken. Trả về sớm.
    return { ok: false, errors };
  }

  /** @type {unknown} */
  let roundTripped;
  try {
    roundTripped = JSON.parse(/** @type {string} */ (serialized));
  } catch (err) {
    // Cực hiếm — stringify được nhưng parse không được. Defensive.
    errors.push({
      code: 'E_MANIFEST_INVALID',
      message: `Manifest serialize được nhưng JSON.parse fail: ${err && err.message ? err.message : String(err)}`,
    });
    return { ok: false, errors };
  }

  if (!deepEqual(manifest, roundTripped)) {
    errors.push({
      code: 'E_MANIFEST_INVALID',
      message:
        'Manifest chứa giá trị non-serializable (undefined, NaN, Infinity, function, Symbol, ...) '
        + '— round-trip JSON.parse(JSON.stringify) không bảo toàn cấu trúc.',
    });
    // Tiếp tục checks 2/3 best-effort: entry.source field thường là string,
    // ít khả năng bị ảnh hưởng bởi non-serializable trong root.
  }

  // -------------------------------------------------------------------------
  // Check 2: no broken link (mọi entry.source phải tồn tại).
  // -------------------------------------------------------------------------
  const key = detectEntryListKey(manifest);
  /** @type {ManifestEntry[]} */
  const entries = Array.isArray(manifest[key]) ? manifest[key] : [];

  /** @type {Set<string>} */
  const declaredSources = new Set();

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!isValidEntryShape(entry)) {
      errors.push({
        code: 'E_MANIFEST_INVALID',
        message: `Entry [${i}] sai shape (cần source/target/type non-empty string).`,
      });
      continue;
    }

    declaredSources.add(entry.source);

    /** @type {string} */
    let osRelPath;
    try {
      osRelPath = toOsPath(entry.source);
    } catch (err) {
      // entry.source chứa path tuyệt đối hoặc traversal — manifest invalid.
      errors.push({
        code: 'E_MANIFEST_INVALID',
        message: `Entry source không hợp lệ (path tuyệt đối hoặc ".." traversal): "${entry.source}"`,
        path: entry.source,
      });
      continue;
    }

    const filePath = path.join(presetDir, osRelPath);
    /** @type {fs.Stats} */
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        errors.push({
          code: 'E_MANIFEST_BROKEN_LINK',
          message: `Entry source không tồn tại trên đĩa: presets/${options.preset}/${entry.source}`,
          path: entry.source,
        });
        continue;
      }
      // Quyền truy cập / I/O lỗi khác: bubble lên — đây là lỗi môi trường,
      // không phải lỗi validate.
      throw err;
    }

    if (!stat.isFile()) {
      errors.push({
        code: 'E_MANIFEST_BROKEN_LINK',
        message: `Entry source tồn tại nhưng không phải file (directory/symlink/...): presets/${options.preset}/${entry.source}`,
        path: entry.source,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Check 3: no orphan (mọi file vật lý phải có entry).
  // -------------------------------------------------------------------------
  const physicalFiles = walkPresetFiles(presetDir);
  // Sort để output errors có thứ tự ổn định (idempotent).
  physicalFiles.sort();

  for (const physical of physicalFiles) {
    if (ORPHAN_CHECK_EXEMPT.has(physical)) continue;
    // .gitkeep files are directory placeholders, not real artifacts — skip
    // regardless of nesting depth (e.g. skills/template-skill/assets/.gitkeep).
    if (path.basename(physical) === '.gitkeep') continue;
    if (declaredSources.has(physical)) continue;

    errors.push({
      code: 'E_MANIFEST_ORPHAN',
      message: `File vật lý không có entry trong manifest: presets/${options.preset}/${physical}`,
      path: physical,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Public API — sub-task 11.4 (throw-on-error wrapper + rollback helper)
// ---------------------------------------------------------------------------

/**
 * Tối đa số message lỗi inline trong aggregated error message của
 * `validateOrThrow`. Khi vượt quá, suffix " ... and N more" được thêm
 * để giữ message log-friendly (không spam stderr với hàng trăm lỗi).
 *
 * @type {number}
 */
const MAX_INLINE_ERRORS = 5;

/**
 * Map từ ValidationError.code sang error code chính của design.md:
 *
 *   - E_MANIFEST_INVALID   (round-trip + entry shape) → E_MANIFEST_INVALID
 *   - E_MANIFEST_BROKEN_LINK (entry.source missing on disk) → E_MANIFEST_INVALID
 *     (theo design: "Manifest sau update không parse được JSON" — nhưng broken
 *     link cũng coi là invalid manifest, exit code 4)
 *   - E_MANIFEST_ORPHAN    (file vật lý không có entry) → E_MANIFEST_NO_ORPHAN
 *     (design.md > Error Handling table dùng `E_MANIFEST_NO_ORPHAN` cho mismatch
 *     orphan ↔ entry; module này emit `E_MANIFEST_ORPHAN` ở cấp ValidationError
 *     vì khớp tên check, nhưng exception throw ra dùng đúng code design).
 *
 * Kết quả: caller (`run.js` task 13.x) thấy code design-aligned và có thể
 * map sang exit code (4 cho cả invalid và no_orphan, theo design table).
 *
 * @type {Readonly<Record<string, string>>}
 */
const ERROR_CODE_ALIASES = Object.freeze({
  E_MANIFEST_INVALID: 'E_MANIFEST_INVALID',
  E_MANIFEST_BROKEN_LINK: 'E_MANIFEST_INVALID',
  E_MANIFEST_ORPHAN: 'E_MANIFEST_NO_ORPHAN',
});

/**
 * Format một danh sách `ValidationError[]` thành single-line aggregate
 * message. Helper riêng để dễ test và bảo đảm idempotent format
 * (deterministic prefix + " ... and N more" suffix).
 *
 * @param {ValidationError[]} errors
 * @returns {string}
 */
function aggregateErrorMessages(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return '(no validation errors)';
  }
  const head = errors.slice(0, MAX_INLINE_ERRORS).map((e) => {
    const code = e && typeof e.code === 'string' ? e.code : 'UNKNOWN';
    const msg = e && typeof e.message === 'string' ? e.message : '';
    return `[${code}] ${msg}`;
  });
  const more = errors.length - head.length;
  if (more > 0) {
    return `${head.join('; ')} ... and ${more} more`;
  }
  return head.join('; ');
}

/**
 * Wrap `validate()` với throw-on-error semantics + rollback context.
 *
 * Sub-task 11.4 (design.md > Error Handling > Error recovery):
 *
 *   "Mỗi preset là một transaction atomic ở mức ManifestUpdater. Nếu
 *    manifest update fail, mọi file vừa ghi cho preset đó được xoá
 *    (tracked qua list `portedFiles`), trở về trạng thái trước khi vào
 *    preset."
 *
 * Separation of concerns:
 *   - `validateOrThrow` chỉ throw khi validate fail; NHÌN THẤY portedFiles
 *     nhưng KHÔNG xoá file. Việc xoá file là transactional boundary của
 *     `run.js` (task 13.x): caller bắt error, gọi `rollbackPortedFiles`,
 *     re-throw hoặc abort theo policy.
 *   - Code mapping: ValidationError.code dùng tên check-level
 *     (E_MANIFEST_BROKEN_LINK, E_MANIFEST_ORPHAN, E_MANIFEST_INVALID).
 *     Exception thrown ra dùng tên design-level qua `ERROR_CODE_ALIASES`
 *     (E_MANIFEST_INVALID hoặc E_MANIFEST_NO_ORPHAN). Caller có cả hai
 *     chiều thông tin: `err.code` (design) + `err.errors[i].code` (check).
 *
 * Idempotency / pure-on-success: validate ok → no throw → return void;
 * caller có thể tiếp tục commit. Mọi tác động ngoài (xoá file) chỉ xảy
 * ra qua helper riêng `rollbackPortedFiles`.
 *
 * Behavior:
 *   1. Gọi `validate(manifest, { preset, workspaceRoot })`.
 *   2. Nếu `result.ok === true`: return undefined.
 *   3. Nếu `result.ok === false`: throw Error với:
 *        - `code`: alias từ first error's code (design-aligned).
 *        - `message`: aggregated message (max 5 lỗi inline + " ... and N more").
 *        - `errors`: full ValidationError[] (cùng reference với
 *                    `result.errors`).
 *        - `portedFiles`: array truyền vào (defensive copy nếu non-array,
 *                         empty array nếu undefined).
 *        - `preset`: preset name.
 *
 * @param {Manifest} manifest
 * @param {object} options
 * @param {string} options.preset
 * @param {string} [options.workspaceRoot]
 * @param {Array<{target_path: string, target_preset?: string}>} [options.portedFiles]
 *        Tracking từ Porter (task 10.2). Không dùng trong validate logic
 *        — chỉ attach vào error cho caller rollback. Mặc định `[]`.
 * @returns {void} Trả undefined khi ok.
 * @throws {TypeError} Shape input sai (bubble từ `validate`).
 * @throws {Error} `code === 'E_MANIFEST_INVALID' | 'E_MANIFEST_NO_ORPHAN'`
 *                 khi validate fail.
 */
function validateOrThrow(manifest, options) {
  // `validate` đã enforce shape check + throw TypeError; gọi trực tiếp.
  const result = validate(manifest, options);
  if (result.ok) {
    return;
  }

  // Defensive: portedFiles là metadata cho rollback, không validate ở đây
  // (run.js là source of truth của tracking list). Nếu caller pass non-array,
  // attach `[]` để downstream rollback handler không crash trên access
  // `.length` / `.forEach`.
  const portedFiles = Array.isArray(options.portedFiles)
    ? options.portedFiles
    : [];

  // First error's code → alias sang design-level code. Nếu code không có
  // trong alias map (defensive — không xảy ra với current ValidationError
  // codes), fallback về E_MANIFEST_INVALID.
  const firstCode = result.errors[0] && typeof result.errors[0].code === 'string'
    ? result.errors[0].code
    : 'E_MANIFEST_INVALID';
  const exceptionCode = ERROR_CODE_ALIASES[firstCode] || 'E_MANIFEST_INVALID';

  const message = `Manifest validation failed for preset "${options.preset}": `
    + aggregateErrorMessages(result.errors);

  throw makeError(exceptionCode, message, {
    errors: result.errors,
    portedFiles,
    preset: options.preset,
  });
}

/**
 * Xoá danh sách file đã port của một preset để revert disk state khi
 * manifest validation fail (task 11.4, design > Error recovery strategy).
 *
 * Design:
 *
 *   "Rollback per preset. Mỗi preset là một transaction atomic ở mức
 *    ManifestUpdater. Nếu manifest update fail, mọi file vừa ghi cho
 *    preset đó được xoá (tracked qua list `portedFiles`), trở về trạng
 *    thái trước khi vào preset."
 *
 * Best-effort: lỗi ENOENT (file đã bị xoá hoặc chưa tạo) được swallow
 * và đếm vào `missing`. Mọi lỗi khác (EACCES, EPERM, EBUSY trên Windows
 * file lock, ...) được capture vào `errors` để caller log warning —
 * không re-throw vì rollback đã bắt đầu, partial revert tốt hơn không
 * revert gì.
 *
 * KHÔNG re-throw original validation error — đó là job của caller
 * (`run.js`): pattern caller dùng là:
 *
 *   try {
 *     manifestUpdater.validateOrThrow(manifest, { preset, workspaceRoot, portedFiles });
 *     manifestUpdater.commit(updateResult);
 *   } catch (err) {
 *     if (err.code === 'E_MANIFEST_INVALID' || err.code === 'E_MANIFEST_NO_ORPHAN') {
 *       const stats = manifestUpdater.rollbackPortedFiles(err.portedFiles, { workspaceRoot });
 *       reporter.logRollback(preset, stats);
 *     }
 *     throw err; // bubble lên CLI exit handler
 *   }
 *
 * Path resolution:
 *   - Mỗi `target_path` là POSIX-style relative to workspace root (Porter
 *     tracking format, xem porter.js > posixOf). Helper join với
 *     `workspaceRoot` qua `path.join` + `toOsPath`.
 *   - Nếu `target_path` chứa absolute path hoặc traversal (".."), helper
 *     reject (count vào `errors`) — defensive, Porter không bao giờ tạo
 *     path như vậy.
 *
 * Idempotency: chạy 2 lần liên tiếp với cùng list → lần đầu xoá thật,
 * lần hai mọi file đã missing → `deleted=0, missing=N, errors=[]`. Total
 * `deleted + missing + errors.length` luôn bằng số entry hợp lệ trong
 * input.
 *
 * @param {Array<{target_path: string, target_preset?: string}>} portedFiles
 * @param {object} options
 * @param {string} options.workspaceRoot Absolute OS path tới workspace root.
 * @returns {{
 *   deleted: number,
 *   missing: number,
 *   errors: Array<{ path: string, error: Error }>
 * }}
 * @throws {TypeError} options.workspaceRoot thiếu/sai shape.
 */
function rollbackPortedFiles(portedFiles, options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('rollbackPortedFiles: options phải có `workspaceRoot`.');
  }
  assertString(options.workspaceRoot, 'options.workspaceRoot');
  if (options.workspaceRoot === '') {
    throw new TypeError('rollbackPortedFiles: options.workspaceRoot không được rỗng.');
  }

  /** @type {{ deleted: number, missing: number, errors: Array<{path: string, error: Error}> }} */
  const stats = { deleted: 0, missing: 0, errors: [] };

  if (!Array.isArray(portedFiles) || portedFiles.length === 0) {
    return stats;
  }

  for (const item of portedFiles) {
    if (!item || typeof item !== 'object') continue;
    const targetPath = typeof item.target_path === 'string' ? item.target_path : '';
    if (targetPath === '') continue;

    /** @type {string} */
    let osRel;
    try {
      osRel = toOsPath(targetPath);
    } catch (err) {
      // Absolute path / traversal — defensive count vào errors.
      stats.errors.push({ path: targetPath, error: /** @type {Error} */ (err) });
      continue;
    }

    const fullPath = path.join(options.workspaceRoot, osRel);

    try {
      fs.unlinkSync(fullPath);
      stats.deleted += 1;
    } catch (err) {
      if (err && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
        stats.missing += 1;
        continue;
      }
      // EISDIR (target_path trỏ đến directory — không nên xảy ra với
      // Porter output), EACCES, EPERM, EBUSY: capture, không throw.
      stats.errors.push({ path: targetPath, error: /** @type {Error} */ (err) });
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Public surface (sub-task 11.1).
  readManifest,
  appendPorted,
  buildEntry,
  update,
  // Public surface (sub-task 11.2).
  sortEntries,
  serialize,
  commit,
  // Public surface (sub-task 11.3).
  validate,
  // Public surface (sub-task 11.4).
  validateOrThrow,
  rollbackPortedFiles,
  // Exposed cho unit tests + sub-task 11.4 (rollback wrapper). Không
  // thuộc public surface chính của pipeline (`run.js` chỉ gọi `update`,
  // `validate`, `commit`).
  manifestPathFor,
  detectEntryListKey,
  deriveDefaultTarget,
  deriveTypeFromPath,
  toPresetRelative,
  isValidEntryShape,
  compareByTarget,
  deepEqual,
  walkPresetFiles,
  aggregateErrorMessages,
  KNOWN_TYPES,
  ENTRY_LIST_KEYS,
  MANIFEST_BASENAME,
  ORPHAN_CHECK_EXEMPT,
  WALK_SKIP_DIRS,
  JSON_INDENT,
  TRAILING_NEWLINE,
  MAX_INLINE_ERRORS,
  ERROR_CODE_ALIASES,
};
