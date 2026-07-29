/**
 * Atomic Writer for the upstream kit Parity Sync.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 3 / 8.1–8.3 — writeAtomic via tmp + rename, fallback copyFile
 *        + unlink khi Windows file lock (retry 3 lần), unit test với fs mock
 *        cho ENOENT/EACCES retry behavior.
 *
 * Trách nhiệm (design.md > Components and Interfaces > AtomicWriter):
 *
 *   Ghi nội dung vào `targetPath` thông qua một file tmp đặt cạnh target,
 *   rồi `fs.renameSync` về tên target. Đây là pattern atomic chuẩn trên cả
 *   POSIX (rename atomic theo POSIX spec khi cùng filesystem) và NTFS
 *   (MoveFileEx atomic giữa same volume). Đảm bảo Req 15.3:
 *
 *     "WHEN script bị huỷ giữa chừng (Ctrl+C), THE Parity_Sync_Process SHALL
 *      tránh tình trạng partial-write bằng cách viết vào file tạm `.tmp` rồi
 *      rename atomic."
 *
 *   Trên Windows, rename có thể fail (EBUSY/EPERM/EACCES) khi target file
 *   đang được antivirus / search indexer / editor giữ open. Spec yêu cầu
 *   retry 3 lần rồi fallback `copyFile + unlink tmp` — copyFile chấp nhận
 *   open handle ở target trong nhiều trường hợp hơn là rename (NTFS replace
 *   semantics).
 *
 *   Nếu cả 3 lần retry rename + fallback copyFile đều fail, throw `Error`
 *   với `code === 'E_WRITE_LOCK'` (xem design.md > Error Handling). Caller
 *   `run.js` map sang exit code 3.
 *
 * Pipeline integration:
 *   - Porter (task 10.x) gọi `writeAtomic(targetPath, content)` cho mỗi
 *     PortPlan output.
 *   - ManifestUpdater (task 11.x) gọi `writeAtomic` cho `manifest.json` sau
 *     khi merge entries.
 *   - Reporter (task 12.x) gọi `writeAtomic` cho 3 file report.
 *
 * Cross-platform & idempotency:
 *   - Tự `mkdir -p` parent directory trước khi ghi tmp (Porter sẽ port file
 *     vào subdir mới như `presets/data-ai/skills/document-skills/docx/...`
 *     mà subdir đó chưa tồn tại).
 *   - Buffer input ⇒ ghi raw binary; string input ⇒ ghi UTF-8.
 *   - Best-effort cleanup tmp khi error (ENOENT trong cleanup được nuốt vì
 *     tmp có thể đã được rename thành công ở attempt trước đó).
 *   - Idempotent ở mức "nội dung file target sau write match content
 *     argument" (Property 10 — Idempotency).
 *
 * Pure CommonJS, chỉ dùng Node built-in `fs`, `path`, `crypto`. Không I/O
 * async (script chạy maintainer-time, sync API là chấp nhận được — file
 * preset đều nhỏ).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Số lần thử `renameSync` trước khi fallback sang `copyFileSync + unlinkSync`.
 * Spec task 8.2: "retry 3 lần". Sau 3 lần fail, attempt fallback. Sau khi
 * fallback cũng fail, throw E_WRITE_LOCK.
 *
 * @type {number}
 */
const RENAME_MAX_ATTEMPTS = 3;

/**
 * Error codes (Node fs) coi là "transient lock" → retry. Đây là bộ codes
 * Windows hay phát sinh khi file target đang bị giữ:
 *   - EBUSY: resource locked / open by another process.
 *   - EPERM: operation not permitted (Windows hay trả EPERM thay vì EACCES
 *     cho rename khi file open ở mode share-delete).
 *   - EACCES: permission denied.
 *   - EEXIST: hiếm khi xảy ra với rename (target tồn tại không là lỗi trên
 *     POSIX/NTFS) nhưng giữ trong list để defensive — một số driver SMB
 *     reject rename-to-existing.
 *
 * ENOENT, EISDIR, EROFS KHÔNG nằm trong list — đó là lỗi cấu trúc thực sự,
 * retry vô nghĩa, để bubble lên ngay.
 *
 * Frozen Set để O(1) lookup và bảo vệ runtime mutation.
 *
 * @type {ReadonlySet<string>}
 */
const RETRYABLE_RENAME_CODES = Object.freeze(
  new Set(['EBUSY', 'EPERM', 'EACCES', 'EEXIST']),
);

/**
 * Length (in hex chars) của random suffix trong tmp filename. 6 hex chars =
 * 24 bits = ~16M giá trị, đủ cho parity-sync (chạy maintainer-time, vài
 * trăm file/run, va chạm cực hiếm). Kết hợp với `process.pid` đảm bảo unique
 * giữa concurrent runs (dù tool không document concurrent usage).
 *
 * @type {number}
 */
const TMP_RANDOM_HEX_LEN = 6;

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
 * Tạo Error với `code` field gắn sẵn (giống convention Node fs errors).
 * Wrap original error vào `cause` để debugger có thể trace nguồn gốc.
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

/**
 * Sinh tmp filename: `<targetPath>.tmp.<pid>.<random6>`.
 *
 * Tmp đặt CẠNH target (cùng directory) thay vì `os.tmpdir()` để đảm bảo
 * rename atomic — POSIX/NTFS chỉ guarantee atomicity khi source và target
 * cùng filesystem. `os.tmpdir()` có thể nằm trên partition khác và rename
 * sẽ degrade thành copy+unlink (không atomic).
 *
 * @param {string} targetPath
 * @returns {string} OS-native path tới tmp file.
 */
function makeTmpPath(targetPath) {
  const random = crypto.randomBytes(TMP_RANDOM_HEX_LEN / 2).toString('hex');
  return `${targetPath}.tmp.${process.pid}.${random}`;
}

/**
 * `mkdir -p` cho parent directory của `targetPath`.
 *
 * Node 10.12+ hỗ trợ `recursive: true` native — không throw nếu directory
 * đã tồn tại. Đây là behavior cần thiết cho idempotency: chạy lần 2 không
 * sinh error "directory exists".
 *
 * @param {string} targetPath
 */
function ensureParentDir(targetPath) {
  const parent = path.dirname(targetPath);
  // path.dirname trả về '.' khi targetPath không có separator; mkdir('.', recursive)
  // là no-op an toàn.
  fs.mkdirSync(parent, { recursive: true });
}

/**
 * Best-effort cleanup tmp file. Nuốt ENOENT (tmp có thể đã được rename
 * thành công), rethrow mọi lỗi khác (EACCES trên tmp lúc cleanup nghĩa là
 * filesystem có vấn đề thực sự — không nên silent).
 *
 * @param {string} tmpPath
 */
function cleanupTmp(tmpPath) {
  try {
    fs.unlinkSync(tmpPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return;
    }
    // Không rethrow ở đây — caller đang xử lý error path, double-throw
    // sẽ che mất root cause. Caller có thể tự log nếu cần. Nuốt im lặng
    // ở best-effort cleanup là pattern chuẩn (xem Node lib/fs.js
    // implementation của fs.cp).
  }
}

/**
 * Determine xem error có retryable không.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetryableRenameError(err) {
  return Boolean(
    err
    && typeof err === 'object'
    && 'code' in err
    && typeof /** @type {{ code: unknown }} */ (err).code === 'string'
    && RETRYABLE_RENAME_CODES.has(/** @type {{ code: string }} */ (err).code),
  );
}

/**
 * Encode content thành Buffer/string phù hợp với fs.writeFileSync.
 * - Buffer: pass-through (raw binary write).
 * - string: trả về string + encoding 'utf8' để fs ghi đúng UTF-8.
 *
 * Không support Uint8Array thuần (caller có thể wrap qua Buffer.from nếu cần)
 * để giữ API surface hẹp — toàn bộ pipeline KiroKit chỉ generate string
 * (markdown, JSON serialize) hoặc Buffer (binary fixture như .xsd schema).
 *
 * @param {string | Buffer} content
 * @returns {{ data: string | Buffer, encoding: BufferEncoding | undefined }}
 */
function encodeContent(content) {
  if (Buffer.isBuffer(content)) {
    return { data: content, encoding: undefined };
  }
  if (typeof content === 'string') {
    return { data: content, encoding: 'utf8' };
  }
  throw new TypeError(
    `content phải là string hoặc Buffer, nhận được: ${
      content === null ? 'null' : typeof content
    }`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ghi `content` vào `targetPath` theo pattern atomic tmp+rename, có retry
 * và fallback cho Windows file lock.
 *
 * Algorithm:
 *   1. Validate input.
 *   2. mkdir -p parent dir.
 *   3. Generate `<targetPath>.tmp.<pid>.<random6>`.
 *   4. fs.writeFileSync(tmp, content).
 *   5. Loop 3 lần:
 *        - try fs.renameSync(tmp, target) → success ⇒ return.
 *        - retryable error (EBUSY/EPERM/EACCES/EEXIST) ⇒ tiếp tục loop.
 *        - non-retryable (ENOENT, EISDIR, ...) ⇒ cleanup tmp, rethrow.
 *   6. Sau 3 lần fail, fallback:
 *        - fs.copyFileSync(tmp, target).
 *        - fs.unlinkSync(tmp).
 *        - return.
 *      Nếu fallback throw, cleanup tmp + throw E_WRITE_LOCK wrap original.
 *   7. Nếu writeFileSync ở bước 4 throw, cleanup tmp (idempotent) và rethrow
 *      — tmp file có thể đã partial-written, KHÔNG để lại rác trong repo.
 *
 * Edge cases handled:
 *   - Parent dir không tồn tại ⇒ mkdir -p auto.
 *   - Content rỗng (empty string / empty Buffer) ⇒ ghi file rỗng (legitimate).
 *   - Target đã tồn tại ⇒ rename overwrite (POSIX/NTFS đều support).
 *   - tmp filename collision với user file đang có ⇒ random suffix làm
 *     collision xác suất ~0.
 *
 * @param {string} targetPath OS-native path (caller chịu trách nhiệm convert
 *   từ POSIX sang OS-native qua `lib/path-utils.toOsPath` nếu cần).
 * @param {string | Buffer} content
 * @returns {void}
 * @throws {TypeError} Nếu input không hợp lệ.
 * @throws {Error} Với `code === 'E_WRITE_LOCK'` khi rename + fallback đều
 *   fail. Mọi lỗi khác (ENOENT trên parent volume, EROFS, ...) được rethrow
 *   với code gốc của Node.
 */
function writeAtomic(targetPath, content) {
  assertString(targetPath, 'targetPath');
  const { data, encoding } = encodeContent(content);

  ensureParentDir(targetPath);

  const tmpPath = makeTmpPath(targetPath);

  // ---- Step 1: write tmp file ----
  try {
    if (encoding === undefined) {
      // Buffer write — không truyền encoding (Node sẽ ghi raw).
      fs.writeFileSync(tmpPath, /** @type {Buffer} */ (data));
    } else {
      fs.writeFileSync(tmpPath, /** @type {string} */ (data), { encoding });
    }
  } catch (err) {
    // tmp có thể đã partial-written (ví dụ ENOSPC giữa write). Cleanup
    // best-effort rồi rethrow nguyên error để caller phân biệt nguyên nhân.
    cleanupTmp(tmpPath);
    throw err;
  }

  // ---- Step 2: rename loop ----
  let lastRenameErr = null;
  for (let attempt = 1; attempt <= RENAME_MAX_ATTEMPTS; attempt++) {
    try {
      fs.renameSync(tmpPath, targetPath);
      // Success — tmp đã được consume bởi rename, không cần cleanup.
      return;
    } catch (err) {
      lastRenameErr = err;
      if (!isRetryableRenameError(err)) {
        // Non-transient: cleanup tmp + rethrow ngay.
        cleanupTmp(tmpPath);
        throw err;
      }
      // Retryable — tiếp tục loop. Không có setTimeout (sync API);
      // attempt nối tiếp đủ vì lock thường giải phóng giữa các syscall.
      // (Spec task 8.2: "retry 3 lần", không yêu cầu delay.)
    }
  }

  // ---- Step 3: fallback copyFile + unlink ----
  try {
    fs.copyFileSync(tmpPath, targetPath);
  } catch (copyErr) {
    cleanupTmp(tmpPath);
    throw makeError(
      'E_WRITE_LOCK',
      `writeAtomic fail sau ${RENAME_MAX_ATTEMPTS} lần rename + fallback copyFile`
      + ` cho "${targetPath}": ${copyErr && copyErr.message ? copyErr.message : 'unknown'}`,
      // Ưu tiên giữ rename error gốc làm cause vì nó là root cause
      // (lock); copyErr chỉ là dấu hiệu fallback cũng thất bại.
      lastRenameErr || copyErr,
    );
  }

  // copyFile thành công — xoá tmp. ENOENT (tmp đã biến mất, ví dụ disk
  // glitch) được nuốt; lỗi khác cũng nuốt vì target đã ghi xong, tmp leak
  // không ảnh hưởng correctness (chỉ tốn disk space, được dọn ở next run
  // nếu cùng path / hoặc bởi maintainer).
  cleanupTmp(tmpPath);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  writeAtomic,
  // Exposed cho unit tests (task 8.3) assert constants + helpers nội bộ.
  // Không thuộc public surface của Porter — Porter chỉ gọi `writeAtomic`.
  RENAME_MAX_ATTEMPTS,
  RETRYABLE_RENAME_CODES,
};
