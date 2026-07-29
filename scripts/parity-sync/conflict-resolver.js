/**
 * ConflictResolver for the upstream kit Parity Sync.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 3 / 9.1–9.6 — cây quyết định 4 tier, JSON deep-merge, sidecar
 *        idempotency, ConflictDecision shape, Property 6, edge 12.4.
 *
 * Trách nhiệm (design.md > Components and Interfaces > ConflictResolver):
 *
 *   Khi target file đã tồn tại và nội dung khác source-rebranded, áp dụng
 *   cây quyết định 4 tier theo Req 12.1:
 *
 *     Start: target file tồn tại?
 *       No  → write-new
 *       Yes → hash equal?
 *         Yes → no-op (idempotent)
 *         No  → Tier 1: target_lines > 1.5 × source_lines?
 *           Yes → kept-target (target dài hơn nhiều ⇒ giữ target)
 *           No  → Tier 2: source có YAML field target lacks?
 *             Yes → merged-frontmatter (merge front-matter, body target)
 *             No  → Tier 3: |target_lines − source_lines| < 20%?
 *               Yes → sidecar (write <basename>.source<ext> alongside)
 *               No  → Tier 4: kept-target (default)
 *
 *   Đặc biệt cho file JSON (settings.json, metadata.json, .mcp.json.example,
 *   hoặc bất kỳ file extension `.json`): bypass cây tier — áp dụng JSON
 *   deep-merge strategy "giữ key target, chỉ thêm key mới từ source"
 *   (Req 8.4–8.6, 7.7). Decision = `json-merged`.
 *
 * Sidecar idempotency (task 9.6, Req 12.4):
 *
 *   "IF maintainer đã review và xoá file `<basename>.source.md`, THEN THE
 *    Parity_Sync_Process SHALL coi conflict đã được giải quyết ở lần chạy
 *    tiếp theo."
 *
 *   Implementation: caller truyền `opts.sessionState.resolvedSidecars` (a
 *   Set<string>) chứa các sidecar path đã được maintainer giải quyết.
 *   Resolver kiểm tra sidecar path TRƯỚC khi áp tier tree — nếu sidecar
 *   path nằm trong set, decision = `kept-target` với reason
 *   `sidecar-resolved-by-maintainer` (không sinh sidecar mới).
 *
 *   Bên cạnh đó, ngay cả khi sessionState không được truyền, resolver vẫn
 *   idempotent ở mức nội dung: nếu sidecar đã tồn tại trên disk với content
 *   match source, không re-write (no-op cho file sidecar). Đây là defense
 *   in-depth cho Req 15.1 (Idempotency).
 *
 * API:
 *
 *   const resolver = require('./conflict-resolver');
 *   const decision = resolver.resolve({ targetPath, sourceContent, ... });
 *   resolver.applyDecision(decision, { sourceContent });
 *   const merged = resolver.deepMergeJson(targetObj, sourceObj);
 *
 * Pure CommonJS, dùng `lib/hash-utils`, `lib/yaml-front-matter`, và
 * `atomic-writer` cho I/O. Tách `resolve` (decision) khỏi `applyDecision`
 * (I/O) để pipeline có thể preview decisions trong dry-run mode.
 *
 * @typedef {(
 *   'no-op'
 *   | 'write-new'
 *   | 'kept-target'
 *   | 'merged-frontmatter'
 *   | 'sidecar'
 *   | 'json-merged'
 * )} DecisionType
 *
 * @typedef {object} ConflictDecision
 * @property {string} target_path
 * @property {DecisionType} decision
 * @property {string} reason
 * @property {string} source_hash             sha256 hex của source content (đã rebrand).
 * @property {string|null} target_hash        sha256 hex của target content hiện có,
 *                                            null nếu target không tồn tại.
 * @property {string} [sidecar_path]          chỉ khi decision === 'sidecar'.
 * @property {string} timestamp               ISO 8601, dùng cho conflict-log.md.
 * @property {boolean} [wasNoOp]              Sidecar đã có với content equal ⇒ skip write.
 * @property {object} [mergedFrontMatter]     Front-matter sau merge (Tier 2).
 * @property {string} [mergedBody]            Body target giữ lại (Tier 2).
 * @property {object} [mergedJson]            Object JSON sau deep merge.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const hashUtils = require('./lib/hash-utils');
const yamlFrontMatter = require('./lib/yaml-front-matter');
const atomicWriter = require('./atomic-writer');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Tier 1 threshold: target_lines > KEEP_TARGET_RATIO × source_lines ⇒
 * giữ target. Req 12.1 quy định "1.5 lần".
 *
 * @type {number}
 */
const KEEP_TARGET_RATIO = 1.5;

/**
 * Tier 3 threshold: |target_lines - source_lines| / max(source, target) < 20%
 * ⇒ tạo sidecar. Req 12.1 quy định "<20%".
 *
 * @type {number}
 */
const SIDECAR_DIFF_RATIO = 0.2;

/**
 * Set basename (case-sensitive) của các file áp dụng JSON deep-merge bypass
 * tier tree (Req 7.7, 8.4–8.6). Bất kỳ file `.json` nào khác cũng được áp
 * dụng (xem `isJsonMergeFile`); set này là tài liệu hoá các file chuẩn.
 *
 * @type {ReadonlySet<string>}
 */
const JSON_MERGE_BASENAMES = Object.freeze(
  new Set([
    'settings.json',
    'metadata.json',
    '.mcp.json.example',
  ]),
);

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

function assertContent(value, paramName) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) {
    throw new TypeError(
      `${paramName} phải là string hoặc Buffer, nhận được: ${
        value === null ? 'null' : typeof value
      }`,
    );
  }
}

/**
 * Convert content (string|Buffer) thành Buffer để hash hoặc compare đồng
 * nhất. UTF-8 cho string, pass-through cho Buffer.
 *
 * @param {string|Buffer} content
 * @returns {Buffer}
 */
function toBuffer(content) {
  if (Buffer.isBuffer(content)) return content;
  return Buffer.from(content, 'utf8');
}

/**
 * Đếm số dòng trong content. Định nghĩa: số ký tự `\n` + 1 (nếu non-empty).
 * Empty string ⇒ 0 dòng. Tương đương `content.split('\n').length` cho
 * non-empty, nhưng tránh allocate array lớn.
 *
 * Trim trailing `\r` không cần thiết — `\n` count vẫn đúng cho cả LF và CRLF.
 *
 * @param {string|Buffer} content
 * @returns {number}
 */
function countLines(content) {
  const s = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  if (s.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 0x0a) count++;
  }
  // Nếu kết thúc bằng `\n`, dòng cuối là rỗng — không tính (idiomatic
  // line count: `wc -l` count newline chars + 1 only if missing trailing \n).
  // Tuy nhiên cho consistency với Property 6 generator (random N dòng),
  // ta giữ định nghĩa "số `\n` + 1 nếu non-empty và không tính trailing \n
  // làm dòng riêng" — tức: nếu content kết thúc bằng \n, trừ 1.
  if (s.charCodeAt(s.length - 1) === 0x0a) count--;
  return Math.max(count, 1);
}

/**
 * Build sidecar path: cùng directory với target, basename thêm `.source`
 * trước extension.
 *
 * Ví dụ:
 *   "presets/frontend/agents/x.md"     → "presets/frontend/agents/x.source.md"
 *   "presets/_/skills/y/SKILL.md"      → "presets/_/skills/y/SKILL.source.md"
 *   "presets/foo/file"                 → "presets/foo/file.source"
 *
 * Cross-platform: dùng `path.posix.dirname/extname/basename` vì caller
 * truyền POSIX style. Nếu caller truyền OS-native, kết quả vẫn đúng
 * vì extname/basename agnostic với separator.
 *
 * @param {string} targetPath
 * @returns {string}
 */
function buildSidecarPath(targetPath) {
  const ext = path.extname(targetPath);
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath, ext);
  // Nếu dir là '.', join sẽ chỉ trả về basename — đúng behavior.
  return path.join(dir, `${base}.source${ext}`);
}

/**
 * Trả về basename POSIX-style (luôn dùng forward slash để detect).
 *
 * @param {string} targetPath
 * @returns {string}
 */
function basenameOf(targetPath) {
  // path.basename xử lý đúng cả `/` và `\\` trên mọi OS.
  return path.basename(targetPath);
}

/**
 * Kiểm tra file path có thuộc nhóm JSON merge không.
 * Đúng nếu basename ∈ JSON_MERGE_BASENAMES hoặc extension là `.json`.
 *
 * Note: `.mcp.json.example` không có extension `.json` (extname trả về
 * `.example`), nên cần check basename riêng.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function isJsonMergeFile(targetPath) {
  const base = basenameOf(targetPath);
  if (JSON_MERGE_BASENAMES.has(base)) return true;
  return path.extname(targetPath).toLowerCase() === '.json';
}

/**
 * Detect xem source có YAML field nào mà target không có (Tier 2 trigger).
 * Cả hai content phải có front-matter; nếu một trong hai không có/malformed,
 * trả về false (không áp Tier 2).
 *
 * @param {string} sourceText
 * @param {string} targetText
 * @returns {boolean}
 */
function sourceHasNewYamlField(sourceText, targetText) {
  let srcParsed;
  let tgtParsed;
  try {
    srcParsed = yamlFrontMatter.parse(sourceText);
    tgtParsed = yamlFrontMatter.parse(targetText);
  } catch (err) {
    if (err && err.code === 'E_FRONTMATTER') return false;
    throw err;
  }
  if (!srcParsed.hasFrontMatter) return false;
  // Target không có front-matter nhưng source có ⇒ source có field "mới".
  if (!tgtParsed.hasFrontMatter) return Object.keys(srcParsed.data).length > 0;

  for (const key of Object.keys(srcParsed.data)) {
    if (!Object.prototype.hasOwnProperty.call(tgtParsed.data, key)) {
      return true;
    }
  }
  return false;
}

/**
 * Tính `target_lines` của file existing trên disk. Trả về null nếu file
 * không tồn tại, throw cho lỗi I/O khác.
 *
 * @param {string} targetPath
 * @returns {{ exists: boolean, content: Buffer|null, lines: number }}
 */
function readTargetIfExists(targetPath) {
  try {
    const buf = fs.readFileSync(targetPath);
    return { exists: true, content: buf, lines: countLines(buf) };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { exists: false, content: null, lines: 0 };
    }
    throw err;
  }
}

/**
 * Plain-object check (loại trừ Array, Buffer, null).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && !Buffer.isBuffer(value)
  );
}

// ---------------------------------------------------------------------------
// Public API: deepMergeJson
// ---------------------------------------------------------------------------

/**
 * Deep merge hai object JSON: giữ key target, chỉ thêm key mới từ source.
 *
 * Strategy (Req 8.4–8.6):
 *   - Nếu cả hai value là plain object: recurse, key target wins khi trùng.
 *   - Nếu key chỉ có ở source: deep-clone source value vào target.
 *   - Nếu key chỉ có ở target: giữ nguyên target value.
 *   - Array: prefer target (KHÔNG merge phần tử mảng để giữ behavior
 *     predictable; nếu target có array, source array mới bị bỏ qua hoàn toàn).
 *   - Primitive (string/number/bool/null): target wins.
 *
 * Return mới object (không mutate input). Stable cho repeated calls.
 *
 * @param {object} targetObj
 * @param {object} sourceObj
 * @returns {object}
 */
function deepMergeJson(targetObj, sourceObj) {
  if (!isPlainObject(targetObj)) {
    throw new TypeError('deepMergeJson: targetObj phải là plain object.');
  }
  if (!isPlainObject(sourceObj)) {
    throw new TypeError('deepMergeJson: sourceObj phải là plain object.');
  }

  /** @type {Record<string, unknown>} */
  const out = {};

  // Step 1: copy mọi key target (giữ giá trị, recurse nếu object).
  for (const key of Object.keys(targetObj)) {
    const tVal = /** @type {Record<string, unknown>} */ (targetObj)[key];
    if (
      Object.prototype.hasOwnProperty.call(sourceObj, key)
      && isPlainObject(tVal)
      && isPlainObject(/** @type {Record<string, unknown>} */ (sourceObj)[key])
    ) {
      // Cả hai là object ⇒ deep merge recursive.
      out[key] = deepMergeJson(
        /** @type {object} */ (tVal),
        /** @type {object} */ (/** @type {Record<string, unknown>} */ (sourceObj)[key]),
      );
    } else {
      // Target wins (primitive, array, hoặc một bên là primitive).
      out[key] = deepCloneJson(tVal);
    }
  }

  // Step 2: thêm key chỉ có ở source.
  for (const key of Object.keys(sourceObj)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = deepCloneJson(/** @type {Record<string, unknown>} */ (sourceObj)[key]);
    }
  }

  return out;
}

/**
 * Deep clone JSON-safe value. Tránh dùng `structuredClone` để giữ
 * compatibility với Node 14+. JSON serialize/parse là an toàn cho input
 * đã filter (no Buffer, no Date, no function).
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function deepCloneJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepCloneJson);
  if (Buffer.isBuffer(value)) {
    // Defensive: không xảy ra với JSON merge nhưng tránh crash.
    return Buffer.from(value);
  }
  /** @type {Record<string, unknown>} */
  const obj = {};
  for (const k of Object.keys(/** @type {Record<string, unknown>} */ (value))) {
    obj[k] = deepCloneJson(/** @type {Record<string, unknown>} */ (value)[k]);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Public API: resolve
// ---------------------------------------------------------------------------

/**
 * Áp cây quyết định 4 tier (hoặc JSON merge) cho cặp (source, target) và
 * trả về `ConflictDecision`. Không thực hiện I/O ghi (read-only); để ghi
 * file dùng `applyDecision`.
 *
 * @param {object} opts
 * @param {string} opts.targetPath              POSIX hoặc OS-native path.
 * @param {string|Buffer} opts.sourceContent    Source content (đã rebrand
 *                                              nếu đó là intent của caller).
 * @param {boolean} [opts.targetExists]         Override probe disk; nếu
 *                                              omit, resolver tự đọc file.
 * @param {{ resolvedSidecars?: Set<string> }} [opts.sessionState]
 *                                              Set chứa sidecar path mà
 *                                              maintainer đã review/xoá
 *                                              (Req 12.4).
 * @returns {ConflictDecision}
 */
function resolve(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('resolve: opts phải là object.');
  }
  assertString(opts.targetPath, 'opts.targetPath');
  assertContent(opts.sourceContent, 'opts.sourceContent');

  const { targetPath } = opts;
  const sourceBuffer = toBuffer(opts.sourceContent);
  const sourceHash = hashUtils.sha256OfBuffer(sourceBuffer);
  const timestamp = new Date().toISOString();

  const sessionState =
    opts.sessionState && typeof opts.sessionState === 'object' ? opts.sessionState : null;
  const resolvedSidecars =
    sessionState && sessionState.resolvedSidecars instanceof Set
      ? sessionState.resolvedSidecars
      : null;

  // ----- Edge 12.4: sidecar đã được maintainer xử lý -----
  // Check TRƯỚC khi áp tier tree để tiết kiệm I/O và đảm bảo idempotency.
  // Sidecar path là deterministic từ targetPath, nên ta có thể tính trước.
  if (resolvedSidecars !== null) {
    const sidecarPath = buildSidecarPath(targetPath);
    if (resolvedSidecars.has(sidecarPath)) {
      const target = readTargetIfExists(targetPath);
      const targetHash = target.exists
        ? hashUtils.sha256OfBuffer(/** @type {Buffer} */ (target.content))
        : null;
      return {
        target_path: targetPath,
        decision: 'kept-target',
        reason: 'sidecar-resolved-by-maintainer',
        source_hash: sourceHash,
        target_hash: targetHash,
        timestamp,
      };
    }
  }

  // ----- Read target -----
  let target;
  let targetExistsExplicit = null;
  if (typeof opts.targetExists === 'boolean') {
    targetExistsExplicit = opts.targetExists;
  }
  target = readTargetIfExists(targetPath);
  // Nếu caller ép `targetExists: false`, override (dùng cho test harness).
  if (targetExistsExplicit === false) {
    target = { exists: false, content: null, lines: 0 };
  }

  // ----- write-new -----
  if (!target.exists) {
    return {
      target_path: targetPath,
      decision: 'write-new',
      reason: 'target-does-not-exist',
      source_hash: sourceHash,
      target_hash: null,
      timestamp,
    };
  }

  const targetBuffer = /** @type {Buffer} */ (target.content);
  const targetHash = hashUtils.sha256OfBuffer(targetBuffer);

  // ----- no-op (hash equal) -----
  if (sourceHash === targetHash) {
    return {
      target_path: targetPath,
      decision: 'no-op',
      reason: 'source-and-target-byte-equal',
      source_hash: sourceHash,
      target_hash: targetHash,
      timestamp,
    };
  }

  // ----- JSON merge bypass (Req 7.7, 8.4–8.6) -----
  if (isJsonMergeFile(targetPath)) {
    return resolveJson({
      targetPath,
      sourceBuffer,
      targetBuffer,
      sourceHash,
      targetHash,
      timestamp,
    });
  }

  // ----- Tier tree (text content) -----
  const sourceText = sourceBuffer.toString('utf8');
  const targetText = targetBuffer.toString('utf8');
  const sourceLines = countLines(sourceBuffer);
  const targetLines = target.lines;

  // Tier 1: target dài > 1.5 × source ⇒ kept-target.
  if (targetLines > KEEP_TARGET_RATIO * sourceLines) {
    return {
      target_path: targetPath,
      decision: 'kept-target',
      reason: `tier-1: target_lines (${targetLines}) > ${KEEP_TARGET_RATIO} × source_lines (${sourceLines})`,
      source_hash: sourceHash,
      target_hash: targetHash,
      timestamp,
    };
  }

  // Tier 2: source có YAML field mới ⇒ merged-frontmatter.
  if (sourceHasNewYamlField(sourceText, targetText)) {
    let mergedData;
    let mergedBody;
    try {
      const srcParsed = yamlFrontMatter.parse(sourceText);
      const tgtParsed = yamlFrontMatter.parse(targetText);
      mergedData = yamlFrontMatter.mergeFrontMatter(tgtParsed.data, srcParsed.data);
      mergedBody = tgtParsed.body;
    } catch (err) {
      // Defensive: nếu parse fail ở đây (đã pass guard sourceHasNewYamlField),
      // fallback sang Tier 4. Hiếm khi xảy ra.
      mergedData = undefined;
      mergedBody = undefined;
    }

    if (mergedData !== undefined && mergedBody !== undefined) {
      return {
        target_path: targetPath,
        decision: 'merged-frontmatter',
        reason: 'tier-2: source has YAML field that target lacks; merge front-matter, keep target body',
        source_hash: sourceHash,
        target_hash: targetHash,
        timestamp,
        mergedFrontMatter: mergedData,
        mergedBody,
      };
    }
  }

  // Tier 3: |target_lines − source_lines| < 20% ⇒ sidecar.
  const maxLines = Math.max(sourceLines, targetLines, 1);
  const diffRatio = Math.abs(targetLines - sourceLines) / maxLines;
  if (diffRatio < SIDECAR_DIFF_RATIO) {
    const sidecarPath = buildSidecarPath(targetPath);
    return {
      target_path: targetPath,
      decision: 'sidecar',
      reason: `tier-3: |target_lines (${targetLines}) − source_lines (${sourceLines})| / max < ${SIDECAR_DIFF_RATIO}`,
      source_hash: sourceHash,
      target_hash: targetHash,
      sidecar_path: sidecarPath,
      timestamp,
    };
  }

  // Tier 4: default kept-target.
  return {
    target_path: targetPath,
    decision: 'kept-target',
    reason: 'tier-4: default keep-target (no other tier matched)',
    source_hash: sourceHash,
    target_hash: targetHash,
    timestamp,
  };
}

/**
 * Resolve cặp JSON file qua deep merge bypass tier tree.
 *
 * @param {object} args
 * @param {string} args.targetPath
 * @param {Buffer} args.sourceBuffer
 * @param {Buffer} args.targetBuffer
 * @param {string} args.sourceHash
 * @param {string} args.targetHash
 * @param {string} args.timestamp
 * @returns {ConflictDecision}
 */
function resolveJson({ targetPath, sourceBuffer, targetBuffer, sourceHash, targetHash, timestamp }) {
  let sourceObj;
  let targetObj;
  try {
    sourceObj = JSON.parse(sourceBuffer.toString('utf8'));
    targetObj = JSON.parse(targetBuffer.toString('utf8'));
  } catch (err) {
    // JSON malformed ⇒ fallback Tier 4 kept-target để tránh ghi đè bị hỏng.
    return {
      target_path: targetPath,
      decision: 'kept-target',
      reason: `json-merge-fallback: JSON parse error (${err && err.message ? err.message : 'unknown'})`,
      source_hash: sourceHash,
      target_hash: targetHash,
      timestamp,
    };
  }

  if (!isPlainObject(sourceObj) || !isPlainObject(targetObj)) {
    // JSON root không phải object (ví dụ array thuần). Fallback kept-target.
    return {
      target_path: targetPath,
      decision: 'kept-target',
      reason: 'json-merge-fallback: JSON root không phải plain object',
      source_hash: sourceHash,
      target_hash: targetHash,
      timestamp,
    };
  }

  const merged = deepMergeJson(targetObj, sourceObj);
  return {
    target_path: targetPath,
    decision: 'json-merged',
    reason: 'json-deep-merge: keep target keys, add source-only keys',
    source_hash: sourceHash,
    target_hash: targetHash,
    timestamp,
    mergedJson: merged,
  };
}

// ---------------------------------------------------------------------------
// Public API: applyDecision
// ---------------------------------------------------------------------------

/**
 * Thực thi I/O theo `decision`. Không mutate decision; chỉ ghi disk theo
 * semantic của decision type.
 *
 * Behavior per decision:
 *   - 'no-op'                 → không ghi gì.
 *   - 'write-new'             → ghi sourceContent vào targetPath.
 *   - 'kept-target'           → không ghi gì (target được giữ nguyên).
 *   - 'merged-frontmatter'    → re-serialize merged front-matter + target
 *                               body, ghi vào targetPath.
 *   - 'sidecar'               → ghi sourceContent vào decision.sidecar_path
 *                               (nếu sidecar đã tồn tại với content equal,
 *                               skip; set decision.wasNoOp = true).
 *   - 'json-merged'           → JSON.stringify(merged, null, 2) + '\n', ghi
 *                               vào targetPath.
 *
 * @param {ConflictDecision} decision
 * @param {object} opts
 * @param {string|Buffer} opts.sourceContent
 * @returns {{ wrote: boolean, path: string|null, wasNoOp: boolean }}
 */
function applyDecision(decision, opts) {
  if (!decision || typeof decision !== 'object') {
    throw new TypeError('applyDecision: decision phải là ConflictDecision object.');
  }
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('applyDecision: opts phải là object.');
  }
  assertContent(opts.sourceContent, 'opts.sourceContent');

  const sourceBuffer = toBuffer(opts.sourceContent);

  switch (decision.decision) {
    case 'no-op':
    case 'kept-target':
      return { wrote: false, path: null, wasNoOp: true };

    case 'write-new': {
      atomicWriter.writeAtomic(decision.target_path, sourceBuffer);
      return { wrote: true, path: decision.target_path, wasNoOp: false };
    }

    case 'merged-frontmatter': {
      if (
        !decision.mergedFrontMatter
        || typeof decision.mergedBody !== 'string'
      ) {
        throw new Error(
          'applyDecision: merged-frontmatter decision thiếu mergedFrontMatter/mergedBody.',
        );
      }
      const out = yamlFrontMatter.serialize(decision.mergedFrontMatter, decision.mergedBody);
      atomicWriter.writeAtomic(decision.target_path, out);
      return { wrote: true, path: decision.target_path, wasNoOp: false };
    }

    case 'sidecar': {
      if (typeof decision.sidecar_path !== 'string') {
        throw new Error('applyDecision: sidecar decision thiếu sidecar_path.');
      }
      // Idempotency: nếu sidecar đã tồn tại với cùng content, skip write
      // (Req 15.1, edge 12.4 defense-in-depth).
      if (hashUtils.bufferEqualsFile(sourceBuffer, decision.sidecar_path)) {
        return { wrote: false, path: decision.sidecar_path, wasNoOp: true };
      }
      atomicWriter.writeAtomic(decision.sidecar_path, sourceBuffer);
      return { wrote: true, path: decision.sidecar_path, wasNoOp: false };
    }

    case 'json-merged': {
      if (!decision.mergedJson) {
        throw new Error('applyDecision: json-merged decision thiếu mergedJson.');
      }
      const out = JSON.stringify(decision.mergedJson, null, 2) + '\n';
      atomicWriter.writeAtomic(decision.target_path, out);
      return { wrote: true, path: decision.target_path, wasNoOp: false };
    }

    default:
      throw new Error(`applyDecision: unknown decision type: ${String(decision.decision)}`);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  resolve,
  applyDecision,
  deepMergeJson,
  // Exposed cho tests + callers cần introspection.
  buildSidecarPath,
  countLines,
  isJsonMergeFile,
  KEEP_TARGET_RATIO,
  SIDECAR_DIFF_RATIO,
  JSON_MERGE_BASENAMES,
};
