/**
 * Inventory Reader for ClaudeKit Parity Sync.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 2 / 2.1, 2.2, 2.3 — đọc inventory-source.json + 7 file
 *        target-files-*.txt, validate schema, throw InventoryError với hướng
 *        dẫn rebuild khi file thiếu/rỗng.
 *
 * Trách nhiệm (design.md > Components and Interfaces > InventoryReader):
 *   - Parse JSON inventory + plain-text target lists.
 *   - Normalize path qua lib/path-utils.
 *   - Expose lookup helpers cho stage DeltaDetector (task 4.x).
 *
 * API:
 *   readSource(appendixDir): { items: SourceItem[] }
 *   readTarget(appendixDir): { byPreset: Record<PresetName, TargetItem[]> }
 *   readAll(appendixDir):    { source, target }
 *
 * Error model (design.md > Error Handling):
 *   InventoryError với .code:
 *     - 'E_INV_MISSING' khi file không tồn tại HOẶC rỗng (Req 1.4).
 *     - 'E_INV_SCHEMA'  khi JSON parse fail HOẶC entry thiếu field bắt buộc /
 *       sai kiểu.
 *   Mọi error đều kèm hint rebuild scripts trong appendix/.
 *
 * Pure I/O sync (Node fs.readFileSync). Không thay đổi appendix files.
 *
 * @example
 *   const { readSource, readTarget, readAll, InventoryError } =
 *     require('./inventory-reader');
 *   try {
 *     const { items } = readSource('docs/audits/claudekit-vs-kirokit/appendix');
 *     console.log(items.length); // 133
 *   } catch (err) {
 *     if (err.code === 'E_INV_MISSING') {
 *       // gợi ý người dùng chạy lại _build-inventory-source.cjs
 *     }
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  VALID_PRESETS,
  normalizeRelPath,
  toOsPath,
} = require('./lib/path-utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Tên file inventory source (JSON, mảng SourceItem).
 */
const SOURCE_INVENTORY_FILENAME = 'inventory-source.json';

/**
 * Sinh tên file target list cho một preset. Phải khớp với output của
 * `_build-inventory-target.cjs` (POSIX style).
 *
 * @param {string} presetName
 * @returns {string}
 */
function targetListFilename(presetName) {
  return `target-files-${presetName}.txt`;
}

/**
 * Hint chung cho mọi InventoryError. Đồng bộ với Req 1.4 và design.md
 * Error Handling table.
 */
const REBUILD_HINT =
  'Rebuild bằng `node docs/audits/claudekit-vs-kirokit/appendix/_build-inventory-source.cjs`'
  + ' và `_build-inventory-target.cjs`.';

/**
 * Field bắt buộc trên mỗi SourceItem (đầy đủ 9 field xem inventory-source.json,
 * nhưng theo task chỉ bốn field này là minimum để pass schema check).
 *
 * @type {ReadonlyArray<string>}
 */
const REQUIRED_SOURCE_FIELDS = Object.freeze([
  'id',
  'kit',
  'artifact_type',
  'path',
]);

// ---------------------------------------------------------------------------
// InventoryError
// ---------------------------------------------------------------------------

/**
 * Lỗi domain cho inventory reader. Code khớp với bảng "Phân loại lỗi" trong
 * design.md > Error Handling.
 *
 * @example
 *   throw new InventoryError(
 *     'E_INV_MISSING',
 *     'inventory-source.json không tồn tại tại /tmp/audit',
 *   );
 */
class InventoryError extends Error {
  /**
   * @param {'E_INV_MISSING'|'E_INV_SCHEMA'} code
   * @param {string} message
   * @param {{ filePath?: string, cause?: unknown }} [details]
   */
  constructor(code, message, details = {}) {
    super(`${message}\n${REBUILD_HINT}`);
    this.name = 'InventoryError';
    this.code = code;
    if (details.filePath) {
      this.filePath = details.filePath;
    }
    if (details.cause !== undefined) {
      this.cause = details.cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Đọc file đồng bộ. Throw InventoryError(E_INV_MISSING) nếu file không tồn tại
 * hoặc rỗng (sau khi trim). Mọi lỗi I/O khác bọc lại làm E_INV_MISSING với cause.
 *
 * @param {string} absPath OS-native absolute (hoặc relative-to-cwd) path.
 * @returns {string}
 */
function readNonEmptyFileSync(absPath) {
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      throw new InventoryError(
        'E_INV_MISSING',
        `File inventory không tồn tại: ${absPath}`,
        { filePath: absPath, cause: err },
      );
    }
    // Bất kỳ lỗi I/O khác (EACCES, EISDIR, ...) cũng coi như "không đọc được".
    throw new InventoryError(
      'E_INV_MISSING',
      `Không đọc được file inventory: ${absPath} (${err && err.code ? err.code : 'unknown'})`,
      { filePath: absPath, cause: err },
    );
  }

  if (raw.trim() === '') {
    throw new InventoryError(
      'E_INV_MISSING',
      `File inventory rỗng: ${absPath}`,
      { filePath: absPath },
    );
  }

  return raw;
}

/**
 * Validate một SourceItem candidate. Throw E_INV_SCHEMA với thông tin index +
 * field nếu sai. Pass-through các field optional (basename, size_lines,
 * front_matter, extras) — không strict check để tool linh hoạt với inventory
 * builder rebuild trong tương lai.
 *
 * @param {unknown} entry
 * @param {number} index Vị trí trong mảng (để log lỗi).
 * @param {string} filePath Đường dẫn file (cho error context).
 */
function validateSourceEntry(entry, index, filePath) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new InventoryError(
      'E_INV_SCHEMA',
      `Entry #${index} trong ${filePath} phải là object, nhận được: ${
        Array.isArray(entry) ? 'array' : typeof entry
      }`,
      { filePath },
    );
  }

  const obj = /** @type {Record<string, unknown>} */ (entry);

  for (const field of REQUIRED_SOURCE_FIELDS) {
    const value = obj[field];
    if (value === undefined || value === null) {
      throw new InventoryError(
        'E_INV_SCHEMA',
        `Entry #${index} trong ${filePath} thiếu field bắt buộc "${field}".`,
        { filePath },
      );
    }
    if (typeof value !== 'string') {
      throw new InventoryError(
        'E_INV_SCHEMA',
        `Entry #${index} trong ${filePath} có field "${field}" sai kiểu: cần string, nhận được ${typeof value}.`,
        { filePath },
      );
    }
    if (value === '') {
      throw new InventoryError(
        'E_INV_SCHEMA',
        `Entry #${index} trong ${filePath} có field "${field}" rỗng.`,
        { filePath },
      );
    }
  }
}

/**
 * Parse một file `target-files-<preset>.txt` thành mảng path POSIX.
 *
 * Hành vi:
 *   - Split theo `\r?\n` (xử lý CRLF từ Windows).
 *   - Bỏ qua dòng rỗng (sau trim).
 *   - Bỏ qua dòng comment bắt đầu bằng `#` (đề phòng builder rebuild thêm).
 *   - Mỗi dòng còn lại được normalize qua `normalizeRelPath`.
 *
 * @param {string} raw Nội dung file đã đọc.
 * @param {string} filePath Đường dẫn (cho error context).
 * @returns {string[]}
 */
function parseTargetListContent(raw, filePath) {
  const lines = raw.split(/\r?\n/);
  /** @type {string[]} */
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    let normalized;
    try {
      normalized = normalizeRelPath(line);
    } catch (err) {
      throw new InventoryError(
        'E_INV_SCHEMA',
        `Dòng #${i + 1} trong ${filePath} không phải relative POSIX path hợp lệ: "${line}" (${
          err && err.message ? err.message : 'unknown'
        }).`,
        { filePath, cause: err },
      );
    }
    result.push(normalized);
  }

  if (result.length === 0) {
    // Tất cả dòng đều rỗng / comment → coi như rỗng (E_INV_MISSING).
    throw new InventoryError(
      'E_INV_MISSING',
      `File target list không có entry hữu ích: ${filePath}`,
      { filePath },
    );
  }

  return result;
}

/**
 * Resolve `appendixDir` thành OS-native path tuyệt đối hoặc relative-to-cwd.
 * Cho phép caller truyền POSIX path (e.g. "docs/audits/.../appendix") trên
 * Windows; tool sẽ tự convert.
 *
 * @param {string} appendixDir
 * @returns {string}
 */
function resolveAppendixDir(appendixDir) {
  if (typeof appendixDir !== 'string' || appendixDir === '') {
    throw new InventoryError(
      'E_INV_MISSING',
      `appendixDir phải là string không rỗng, nhận được: ${
        appendixDir === '' ? '""' : typeof appendixDir
      }`,
    );
  }

  // Nếu là path tuyệt đối, dùng nguyên xi (path.isAbsolute hỗ trợ cả Windows).
  if (path.isAbsolute(appendixDir)) {
    return appendixDir;
  }

  // Path tương đối: convert POSIX -> OS native nếu cần. `toOsPath` reject
  // path tuyệt đối (đã loại trừ ở trên) và path traversal.
  try {
    return toOsPath(appendixDir);
  } catch (err) {
    throw new InventoryError(
      'E_INV_MISSING',
      `appendixDir không hợp lệ: "${appendixDir}" (${
        err && err.message ? err.message : 'unknown'
      }).`,
      { cause: err },
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Đọc và parse `<appendixDir>/inventory-source.json`.
 *
 * Validate mỗi entry có ít nhất 4 field bắt buộc: `id`, `kit`, `artifact_type`,
 * `path` (đều là string non-empty). Các field optional (basename, size_lines,
 * front_matter, extras) được pass-through nếu có.
 *
 * Path trong field `path` được normalize qua `normalizeRelPath` để bảo đảm
 * POSIX-style xuyên suốt pipeline; KHÔNG strip prefix `claudekit-engineer-main/`
 * ở stage này (để DeltaDetector quyết định khi nào strip).
 *
 * @param {string} appendixDir Đường dẫn tới `docs/audits/claudekit-vs-kirokit/appendix/`.
 * @returns {{ items: import('./types').SourceItem[] }}
 * @throws {InventoryError}
 *
 * @example
 *   const { items } = readSource('docs/audits/claudekit-vs-kirokit/appendix');
 *   console.log(items.length); // 133
 */
function readSource(appendixDir) {
  const dir = resolveAppendixDir(appendixDir);
  const filePath = path.join(dir, SOURCE_INVENTORY_FILENAME);

  const raw = readNonEmptyFileSync(filePath);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InventoryError(
      'E_INV_SCHEMA',
      `JSON parse thất bại tại ${filePath}: ${err && err.message ? err.message : 'unknown'}.`,
      { filePath, cause: err },
    );
  }

  if (!Array.isArray(parsed)) {
    throw new InventoryError(
      'E_INV_SCHEMA',
      `Inventory source phải là JSON array, nhận được: ${
        parsed === null ? 'null' : typeof parsed
      } tại ${filePath}.`,
      { filePath },
    );
  }

  /** @type {import('./types').SourceItem[]} */
  const items = new Array(parsed.length);

  for (let i = 0; i < parsed.length; i++) {
    validateSourceEntry(parsed[i], i, filePath);
    const entry = /** @type {Record<string, unknown>} */ (parsed[i]);

    // Normalize path field (giữ POSIX style). normalizeRelPath đã xử lý cả
    // backslash + leading "./" + collapse "//"; reject ".." / absolute.
    let normalizedPath;
    try {
      normalizedPath = normalizeRelPath(/** @type {string} */ (entry.path));
    } catch (err) {
      throw new InventoryError(
        'E_INV_SCHEMA',
        `Entry #${i} có path không hợp lệ: "${entry.path}" (${
          err && err.message ? err.message : 'unknown'
        }).`,
        { filePath, cause: err },
      );
    }

    items[i] = /** @type {import('./types').SourceItem} */ ({
      ...entry,
      path: normalizedPath,
    });
  }

  return { items };
}

/**
 * Đọc và parse 7 file `target-files-<preset>.txt` (6 preset chính + `_template`).
 *
 * Mỗi file là plain-text, một path POSIX-style trên mỗi dòng. Dòng rỗng và
 * dòng bắt đầu bằng `#` được skip. File rỗng hoặc không tồn tại → throw
 * `InventoryError(E_INV_MISSING)`.
 *
 * @param {string} appendixDir Đường dẫn tới appendix.
 * @returns {{ byPreset: Record<import('./types').PresetName, import('./types').TargetItem[]> }}
 * @throws {InventoryError}
 *
 * @example
 *   const { byPreset } = readTarget('docs/audits/claudekit-vs-kirokit/appendix');
 *   console.log(byPreset.frontend.length); // ~110
 */
function readTarget(appendixDir) {
  const dir = resolveAppendixDir(appendixDir);

  /** @type {Record<string, import('./types').TargetItem[]>} */
  const byPreset = Object.create(null);

  for (const preset of VALID_PRESETS) {
    const filePath = path.join(dir, targetListFilename(preset));
    const raw = readNonEmptyFileSync(filePath);
    const paths = parseTargetListContent(raw, filePath);

    /** @type {import('./types').TargetItem[]} */
    const items = new Array(paths.length);
    for (let i = 0; i < paths.length; i++) {
      items[i] = { preset, path: paths[i] };
    }
    byPreset[preset] = items;
  }

  return { byPreset: /** @type {any} */ (byPreset) };
}

/**
 * Convenience: đọc cả source + target trong một lần gọi.
 *
 * @param {string} appendixDir
 * @returns {{ source: ReturnType<typeof readSource>, target: ReturnType<typeof readTarget> }}
 * @throws {InventoryError}
 */
function readAll(appendixDir) {
  return {
    source: readSource(appendixDir),
    target: readTarget(appendixDir),
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  readSource,
  readTarget,
  readAll,
  InventoryError,
  // Exported cho test (task 2.4 sẽ dùng).
  SOURCE_INVENTORY_FILENAME,
  targetListFilename,
  REQUIRED_SOURCE_FIELDS,
};
