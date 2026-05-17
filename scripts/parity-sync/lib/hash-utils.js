/**
 * Hash utilities for ClaudeKit Parity Sync.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Task: Phase 1 / 1.3 — hash-utils (sha256 file content cho idempotency check).
 *
 * Vai trò trong pipeline:
 *   - ConflictResolver (task 9.x) dùng `filesAreByteEqual` cho nhánh "hash equal -> no-op"
 *     trong cây quyết định 4 tier (xem design.md "ConflictResolver > Logic").
 *   - ConflictDecision data model (design.md) chứa `source_hash` / `target_hash`
 *     dạng sha256 hex lowercase — output của các function ở đây.
 *   - Porter (task 10.x) dùng `bufferEqualsFile` để pre-check: nếu nội dung sau
 *     Rebrander đã byte-equal với file target hiện có thì skip write (Property 10
 *     Idempotency, Property 12 Sub-skill subtree byte-identical).
 *   - AtomicWriter (task 8.x) có thể compute hash sau khi write để verify.
 *
 * Ghi chú thiết kế:
 *   - I/O đồng bộ (`fs.readFileSync`) là chấp nhận được vì đây là maintainer-time
 *     CLI tool, không phải server. File preset đều nhỏ (vài KB - vài chục KB).
 *   - Hash output luôn lowercase hex (consistent với format ghi vào
 *     `conflict-log.md` ở section Reporter).
 *   - Custom error code `E_HASH_FILE_MISSING` (không phải Node ENOENT) để caller
 *     phân biệt "file thiếu khi hashing" vs "lỗi hệ thống khác". Caller nào cần
 *     semantic "missing = no-op" nên dùng `filesAreByteEqual` (đã handle missing
 *     thành `false`) thay vì gọi `sha256OfFile` trực tiếp.
 *
 * Pure CommonJS, chỉ dùng Node built-in `crypto` và `fs`.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/**
 * Tạo Error với `code` field gắn sẵn (giống convention của Node fs errors).
 *
 * @param {string} code
 * @param {string} message
 * @param {Error} [cause]
 * @returns {Error}
 */
function makeError(code, message, cause) {
  const err = new Error(message);
  err.code = code;
  if (cause !== undefined) {
    err.cause = cause;
  }
  return err;
}

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
 * Tính sha256 của một Buffer hoặc string, trả về hex digest lowercase.
 *
 * String được encode UTF-8 trước khi hash (mặc định của `crypto.update(string)`).
 * Đây là behavior ổn định cross-platform vì source files của ClaudeKit đều UTF-8.
 *
 * @param {Buffer | string} buf
 * @returns {string} Hex digest 64 ký tự, lowercase.
 * @throws {TypeError} Nếu input không phải Buffer/string.
 */
function sha256OfBuffer(buf) {
  if (typeof buf !== 'string' && !Buffer.isBuffer(buf)) {
    throw new TypeError(
      `sha256OfBuffer: input phải là Buffer hoặc string, nhận được: ${
        buf === null ? 'null' : typeof buf
      }`,
    );
  }

  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Đọc file tại `filePath` đồng bộ và trả về sha256 hex digest lowercase.
 *
 * Throw `Error` với:
 *   - `code === 'E_HASH_FILE_MISSING'` nếu file không tồn tại (wrap ENOENT).
 *     Caller cần semantic "missing = no-op" thì nên dùng `filesAreByteEqual`
 *     hoặc `bufferEqualsFile` thay vì handle exception này.
 *   - Các error khác (EACCES, EISDIR, EIO, ...) được rethrow nguyên (vẫn giữ
 *     `code` gốc của Node) vì đó là lỗi hệ thống thực sự, không phải edge-case
 *     bình thường của pipeline.
 *
 * @param {string} filePath OS-native path (đã convert qua `toOsPath` nếu cần).
 * @returns {string} Hex digest 64 ký tự, lowercase.
 * @throws {TypeError | Error}
 */
function sha256OfFile(filePath) {
  assertString(filePath, 'filePath');

  let content;
  try {
    content = fs.readFileSync(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw makeError(
        'E_HASH_FILE_MISSING',
        `Không thể hash: file không tồn tại: "${filePath}"`,
        err,
      );
    }
    throw err;
  }

  return sha256OfBuffer(content);
}

/**
 * So sánh nội dung 2 file theo sha256 hash.
 *
 * Trả về `false` (không throw) khi một trong hai file thiếu — đây là semantic
 * "missing = not equal" mà ConflictResolver và idempotency check cần. Mọi error
 * khác (EACCES, EIO, ...) được rethrow vì là lỗi hệ thống thực sự.
 *
 * Optimization: nếu `pathA === pathB` (hoặc normalize bằng nhau ở caller), vẫn
 * đọc và hash cả hai để tiết kiệm độ phức tạp. Caller nào quan tâm performance
 * có thể tự early-return trước khi gọi.
 *
 * @param {string} pathA
 * @param {string} pathB
 * @returns {boolean} `true` nếu cả hai file tồn tại và sha256 bằng nhau.
 * @throws {TypeError | Error}
 */
function filesAreByteEqual(pathA, pathB) {
  assertString(pathA, 'pathA');
  assertString(pathB, 'pathB');

  let hashA;
  let hashB;

  try {
    hashA = sha256OfFile(pathA);
  } catch (err) {
    if (err && err.code === 'E_HASH_FILE_MISSING') {
      return false;
    }
    throw err;
  }

  try {
    hashB = sha256OfFile(pathB);
  } catch (err) {
    if (err && err.code === 'E_HASH_FILE_MISSING') {
      return false;
    }
    throw err;
  }

  return hashA === hashB;
}

/**
 * So sánh một Buffer/string in-memory với nội dung file trên disk theo sha256.
 *
 * Dùng cho Porter pre-write check: sau khi Rebrander transform source content
 * thành buffer mới, kiểm tra xem buffer đã byte-equal với file target hiện có
 * hay chưa — nếu có thì skip write (Property 10 Idempotency).
 *
 * Trả về `false` nếu file target không tồn tại (vẫn cần write).
 *
 * @param {Buffer | string} buf
 * @param {string} filePath
 * @returns {boolean}
 * @throws {TypeError | Error}
 */
function bufferEqualsFile(buf, filePath) {
  if (typeof buf !== 'string' && !Buffer.isBuffer(buf)) {
    throw new TypeError(
      `bufferEqualsFile: buf phải là Buffer hoặc string, nhận được: ${
        buf === null ? 'null' : typeof buf
      }`,
    );
  }
  assertString(filePath, 'filePath');

  let fileHash;
  try {
    fileHash = sha256OfFile(filePath);
  } catch (err) {
    if (err && err.code === 'E_HASH_FILE_MISSING') {
      return false;
    }
    throw err;
  }

  return sha256OfBuffer(buf) === fileHash;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  sha256OfBuffer,
  sha256OfFile,
  filesAreByteEqual,
  bufferEqualsFile,
};
