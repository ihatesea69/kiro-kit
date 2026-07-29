/**
 * Path utilities for the upstream kit Parity Sync.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Task: Phase 1 / 1.2 — path-utils (normalizeRelPath, stripClaudePrefix,
 *       joinPreset, toOsPath, isInsidePreset).
 *
 * Pipeline path semantics (xem design.md "DeltaDetector > Logic"):
 *   - inventory-source.json dùng path POSIX-style với prefix
 *     "the-upstream-kit/.claude/" (ví dụ
 *     "the-upstream-kit/.claude/agents/brainstormer.md").
 *   - Sau `stripClaudePrefix` -> "agents/brainstormer.md".
 *   - Sau `joinPreset('frontend', ...)` -> "presets/frontend/agents/brainstormer.md"
 *     (POSIX style, khớp với target-files-*.txt format).
 *
 * Cross-platform: tool có thể chạy trên Windows. Mọi path tương đối được giữ
 * ở POSIX style (forward slash) xuyên suốt pipeline; chỉ convert sang OS native
 * tại stage I/O thực sự (AtomicWriter — task 8.x) qua `toOsPath`.
 *
 * Pure functional: không I/O, không side-effect.
 */

'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Danh sách preset hợp lệ. Redefine tại đây (frozen) để tránh circular import
 * với `run.js`. Phải khớp 1:1 với `VALID_PRESETS` trong `scripts/parity-sync/run.js`
 * và 7 file `target-files-*.txt` (6 preset chính + `_template`).
 *
 * @type {ReadonlyArray<string>}
 */
const VALID_PRESETS = Object.freeze([
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'devops',
  'data-ai',
  '_template',
]);

const CLAUDE_KIT_ROOT_PREFIX = 'the-upstream-kit/.claude/';
const CLAUDE_DOT_PREFIX = '.claude/';

// Windows drive letter / UNC detection: "C:\foo", "C:/foo", "\\server\share".
const WINDOWS_ABSOLUTE_RE = /^(?:[A-Za-z]:[\\/]|\\\\)/;

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

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Chuẩn hoá một relative path thành POSIX style (forward slash).
 *
 * Hành vi:
 *   - Convert backslash -> forward slash.
 *   - Strip leading "./".
 *   - Strip trailing "/".
 *   - Collapse "//" thành "/".
 *
 * Reject (throw `TypeError`):
 *   - Không phải string.
 *   - Path tuyệt đối (POSIX `/foo`, Windows `C:\foo`, UNC `\\server\share`).
 *   - Có segment `..` (traversal).
 *
 * Empty string trả về "" (caller có thể tự kiểm tra nếu cần).
 *
 * @param {string} p Relative path (POSIX hoặc Windows style).
 * @returns {string} POSIX-style relative path.
 * @throws {TypeError}
 */
function normalizeRelPath(p) {
  assertString(p, 'path');

  // 1) Chuẩn hoá separator.
  let s = p.replace(/\\/g, '/');

  // 2) Reject tuyệt đối (kiểm tra TRƯỚC khi strip).
  if (s.startsWith('/')) {
    throw new TypeError(`Path tuyệt đối không được phép: "${p}"`);
  }
  if (WINDOWS_ABSOLUTE_RE.test(p)) {
    throw new TypeError(`Path tuyệt đối không được phép: "${p}"`);
  }

  // 3) Strip leading "./" (có thể lặp: "././foo" -> "foo").
  while (s.startsWith('./')) {
    s = s.slice(2);
  }

  // 4) Collapse "//" -> "/" (có thể có nhiều run liên tiếp).
  while (s.includes('//')) {
    s = s.replace(/\/\//g, '/');
  }

  // 5) Strip trailing "/" (chỉ khi không phải string rỗng).
  if (s.length > 1 && s.endsWith('/')) {
    s = s.replace(/\/+$/, '');
  }

  // 6) Reject ".." traversal (sau khi đã normalize).
  if (s === '..' || s.startsWith('../') || s.includes('/../') || s.endsWith('/..')) {
    throw new TypeError(`Path traversal ".." không được phép: "${p}"`);
  }

  return s;
}

/**
 * Loại bỏ prefix the upstream kit khỏi inventory path.
 *
 * Hỗ trợ hai dạng input (idempotent):
 *   - "the-upstream-kit/.claude/agents/brainstormer.md" -> "agents/brainstormer.md"
 *   - ".claude/agents/brainstormer.md"                          -> "agents/brainstormer.md"
 *   - "agents/brainstormer.md"                                  -> "agents/brainstormer.md"
 *
 * Path được normalize trước khi strip để xử lý đúng cả Windows separator.
 *
 * @param {string} p
 * @returns {string} Relative path không còn prefix `.claude/`.
 * @throws {TypeError}
 */
function stripClaudePrefix(p) {
  let s = normalizeRelPath(p);

  if (s.startsWith(CLAUDE_KIT_ROOT_PREFIX)) {
    s = s.slice(CLAUDE_KIT_ROOT_PREFIX.length);
  } else if (s.startsWith(CLAUDE_DOT_PREFIX)) {
    s = s.slice(CLAUDE_DOT_PREFIX.length);
  }

  return s;
}

/**
 * Build target path POSIX-style "presets/<preset>/<relPath>".
 *
 * `relPath` được normalize và (nếu cần) strip prefix the upstream kit trước khi join.
 * Dùng `path.posix.join` để bảo đảm output luôn forward-slash kể cả trên Windows.
 *
 * @param {string} presetName Một trong `VALID_PRESETS`.
 * @param {string} relPath Source relative path (có hoặc không có prefix `.claude/`).
 * @returns {string} Ví dụ "presets/frontend/agents/brainstormer.md".
 * @throws {TypeError} preset không hợp lệ hoặc relPath sai định dạng.
 */
function joinPreset(presetName, relPath) {
  assertString(presetName, 'presetName');
  if (!VALID_PRESETS.includes(presetName)) {
    throw new TypeError(
      `Preset không hợp lệ: "${presetName}". Hợp lệ: ${VALID_PRESETS.join(', ')}.`,
    );
  }

  const cleaned = stripClaudePrefix(relPath);
  if (cleaned === '') {
    throw new TypeError('relPath không được rỗng sau khi normalize.');
  }

  return path.posix.join('presets', presetName, cleaned);
}

/**
 * Convert một POSIX relative path sang OS-native path (dùng `path.sep`).
 *
 * Dùng cho stage I/O (AtomicWriter task 8.x). Trên POSIX là no-op; trên Windows
 * chuyển "/" -> "\\".
 *
 * @param {string} posixRelPath
 * @returns {string}
 * @throws {TypeError}
 */
function toOsPath(posixRelPath) {
  const normalized = normalizeRelPath(posixRelPath);
  if (path.sep === '/') {
    return normalized;
  }
  return normalized.split('/').join(path.sep);
}

/**
 * Kiểm tra `targetPath` có nằm trong subtree `presets/<preset>/` không.
 *
 * `targetPath` được normalize trước khi check; matching POSIX-style. Trả về
 * `false` nếu preset hợp lệ nhưng path không match (không throw); throw
 * `TypeError` nếu preset không hợp lệ hoặc input không phải string.
 *
 * @param {string} targetPath
 * @param {string} presetName
 * @returns {boolean}
 * @throws {TypeError}
 */
function isInsidePreset(targetPath, presetName) {
  assertString(presetName, 'presetName');
  if (!VALID_PRESETS.includes(presetName)) {
    throw new TypeError(
      `Preset không hợp lệ: "${presetName}". Hợp lệ: ${VALID_PRESETS.join(', ')}.`,
    );
  }

  const normalized = normalizeRelPath(targetPath);
  const prefix = `presets/${presetName}/`;
  return normalized === `presets/${presetName}` || normalized.startsWith(prefix);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  VALID_PRESETS,
  normalizeRelPath,
  stripClaudePrefix,
  joinPreset,
  toOsPath,
  isInsidePreset,
};
