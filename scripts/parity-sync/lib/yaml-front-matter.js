/**
 * YAML front-matter utilities for the upstream kit Parity Sync.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Task: Phase 1 / 1.4 — yaml-front-matter (parse + serialize, dùng `gray-matter`).
 *
 * Vai trò trong pipeline:
 *   - Porter (task 10.x) gọi `parse` để tách front-matter source trước khi gửi
 *     content qua Rebrander, sau đó `serialize` lại với data front-matter
 *     đã merge / preserve.
 *   - Rebrander (task 7.x) áp dụng transform `frontmatter-keep`: giữ nguyên
 *     `name`, `inclusion`, `argument-hint` của source (Property 5,
 *     Requirements 6.5, 11.2). Đặc biệt `name: claude-code` KHÔNG bị rebrand.
 *   - ConflictResolver Tier 2 "merged-frontmatter" (task 9.x) dùng
 *     `mergeFrontMatter` để gộp field mới từ source vào target front-matter
 *     mà giữ nguyên body của target (target wins khi key trùng).
 *   - Porter task 10.3 dùng `hasField` (qua try/catch) để skip file source
 *     thiếu front-matter hợp lệ, ghi warning và move on (edge 3.7).
 *
 * Ghi chú thiết kế:
 *   - Chỉ là wrapper mỏng quanh `gray-matter` — không tự reimplement YAML
 *     parser. Mọi quirk YAML (anchors, multi-doc, ...) được delegate xuống
 *     gray-matter / js-yaml.
 *   - Empty data object (`{}`) trong `serialize` ⇒ không ghi block
 *     `---\n---` rỗng, trả về body nguyên bản. Lý do: file source không có
 *     front-matter parse ra `data === {}`; round-trip phải giữ behavior đó
 *     để Idempotency (Property 10) không sinh diff "thêm dấu ---".
 *   - Malformed YAML throw `Error` với `code === 'E_FRONTMATTER'`. Caller
 *     bắt code này để skip file kèm warning thay vì fail toàn pipeline.
 *   - Pure CommonJS, không I/O.
 */

'use strict';

const matter = require('gray-matter');

/**
 * Regex phát hiện block YAML front-matter ở đầu content. Chấp nhận cả
 * `\n` và `\r\n` line endings. Match khi content bắt đầu bằng dòng `---`,
 * tiếp theo là body YAML, đóng bằng dòng `---`.
 *
 * Lý do tự detect thay vì tin `parsed.matter` của gray-matter: gray-matter
 * v4 có internal state khiến `parsed.matter` đôi khi `undefined` sau khi
 * gọi `matter.stringify` — round-trip parse → serialize → parse trả về
 * `matter: undefined` ở lần parse thứ hai. Regex này độc lập, deterministic.
 *
 * Empty front-matter (`---\n---\n<body>`) cũng được tính là CÓ front-matter
 * theo nghĩa "có block delimiter"; field check (qua `hasField`) sẽ vẫn trả
 * về `false` vì data rỗng.
 */
const FRONT_MATTER_BLOCK_RE = /^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/;

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/**
 * Tạo Error với `code` field gắn sẵn (giống convention của Node fs errors
 * và `hash-utils.js` trong cùng module).
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

function assertPlainObject(value, paramName) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Buffer.isBuffer(value)
  ) {
    throw new TypeError(
      `${paramName} phải là plain object, nhận được: ${
        value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
      }`,
    );
  }
}

/**
 * Đếm key own enumerable của object (không recurse). Dùng để phân biệt
 * "no front-matter" (data rỗng) vs "có front-matter" trong `serialize`.
 *
 * @param {object} obj
 * @returns {number}
 */
function ownKeyCount(obj) {
  return Object.keys(obj).length;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Parse content có optional YAML front-matter ở đầu.
 *
 * Hành vi:
 *   - Content có block `---\n<yaml>\n---\n<body>` ⇒
 *     `{ data: <parsed>, body: <body>, hasFrontMatter: true }`.
 *   - Content không có block ⇒ `{ data: {}, body: <full content>, hasFrontMatter: false }`.
 *   - YAML malformed ⇒ throw Error với `code === 'E_FRONTMATTER'`, message kèm
 *     parse error gốc.
 *
 * `hasFrontMatter` được detect bằng regex độc lập với gray-matter (xem
 * `FRONT_MATTER_BLOCK_RE`). `data` là shallow clone — caller có thể mutate
 * mà không ảnh hưởng cache nội bộ của gray-matter.
 *
 * @param {string} content Raw file content.
 * @returns {{ data: object, body: string, hasFrontMatter: boolean }}
 * @throws {TypeError} Nếu `content` không phải string.
 * @throws {Error} `code === 'E_FRONTMATTER'` nếu YAML không hợp lệ.
 *
 * @example
 *   parse('---\nname: foo\ninclusion: manual\n---\nbody text');
 *   // => { data: { name: 'foo', inclusion: 'manual' }, body: 'body text', hasFrontMatter: true }
 *
 *   parse('# Just markdown');
 *   // => { data: {}, body: '# Just markdown', hasFrontMatter: false }
 */
function parse(content) {
  assertString(content, 'content');

  let parsed;
  try {
    parsed = matter(content);
  } catch (err) {
    throw makeError(
      'E_FRONTMATTER',
      `YAML front-matter không hợp lệ: ${err && err.message ? err.message : String(err)}`,
      err,
    );
  }

  // Tự detect bằng regex thay vì tin `parsed.matter` — xem comment của
  // FRONT_MATTER_BLOCK_RE phía trên về quirk của gray-matter v4.
  const hasFrontMatter = FRONT_MATTER_BLOCK_RE.test(content);

  // Clone shallow `parsed.data` để tránh chia sẻ reference với cache nội bộ
  // của gray-matter (nhiều lần `matter(sameContent)` trả về cùng `data`
  // object). Caller có thể mutate output mà không ảnh hưởng kết quả parse
  // tiếp theo cùng input.
  const data = parsed.data ? { ...parsed.data } : {};

  return {
    data,
    body: parsed.content,
    hasFrontMatter,
  };
}

/**
 * Serialize data + body thành full content có (hoặc không) front-matter block.
 *
 * Hành vi:
 *   - `data` rỗng (`Object.keys(data).length === 0`) ⇒ trả về `body` nguyên
 *     bản (không thêm block `---\n---`). Đây là invariant để round-trip
 *     `serialize(parse(c).data, parse(c).body)` không sinh diff với content
 *     không có front-matter ban đầu.
 *   - `data` có ít nhất 1 key ⇒ delegate sang `gray-matter.stringify(body, data)`
 *     để sinh block `---\n<yaml>\n---\n<body>`. Output chính xác phụ thuộc
 *     gray-matter (key order, indent, quoting) — caller chấp nhận normalize.
 *
 * @param {object} data Plain object (có thể rỗng).
 * @param {string} body Body markdown/text (có thể rỗng).
 * @returns {string}
 * @throws {TypeError} Nếu `data` không phải plain object hoặc `body` không phải string.
 *
 * @example
 *   serialize({ name: 'x' }, 'body');
 *   // => '---\nname: x\n---\nbody\n'
 *
 *   serialize({}, 'body');
 *   // => 'body'
 */
function serialize(data, body) {
  assertPlainObject(data, 'data');
  assertString(body, 'body');

  if (ownKeyCount(data) === 0) {
    return body;
  }

  // gray-matter.stringify(content, data) trả về string với block front-matter
  // ở đầu. `language === 'yaml'` là default.
  return matter.stringify(body, data);
}

/**
 * Merge front-matter target với source theo strategy "target wins".
 *
 * Trả về object mới chứa:
 *   - Tất cả key của `targetData` (giá trị giữ nguyên).
 *   - Các key chỉ có trong `sourceData` (NOT IN targetData).
 *
 * Khi key xuất hiện ở cả hai, giá trị target được giữ — đây là semantic
 * Tier 2 "merged-frontmatter" của ConflictResolver: bổ sung field mới từ
 * upstream nhưng không ghi đè customization của target.
 *
 * Shallow merge (không recurse vào nested object/array). Nếu spec sau này
 * cần deep-merge cho nested front-matter, thêm hàm riêng — không thay đổi
 * function này.
 *
 * @param {object} targetData
 * @param {object} sourceData
 * @returns {object} Object mới (không mutate input).
 * @throws {TypeError}
 *
 * @example
 *   mergeFrontMatter({ a: 1, b: 2 }, { b: 99, c: 3 });
 *   // => { a: 1, b: 2, c: 3 }
 */
function mergeFrontMatter(targetData, sourceData) {
  assertPlainObject(targetData, 'targetData');
  assertPlainObject(sourceData, 'sourceData');

  const merged = { ...targetData };
  for (const key of Object.keys(sourceData)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[key] = sourceData[key];
    }
  }
  return merged;
}

/**
 * Convenience helper: kiểm tra content có front-matter và chứa field tên
 * `fieldName` không.
 *
 * Trả về `false` (không throw) cho mọi trường hợp:
 *   - Content không có front-matter.
 *   - Field không tồn tại.
 *   - YAML malformed (treat như không có field — caller cần phân biệt thì
 *     gọi `parse` trực tiếp và bắt `E_FRONTMATTER`).
 *
 * @param {string} content
 * @param {string} fieldName
 * @returns {boolean}
 * @throws {TypeError} Chỉ khi input sai type.
 *
 * @example
 *   hasField('---\nname: foo\n---\nbody', 'name');     // => true
 *   hasField('---\nname: foo\n---\nbody', 'missing');  // => false
 *   hasField('# no front-matter', 'name');             // => false
 */
function hasField(content, fieldName) {
  assertString(content, 'content');
  assertString(fieldName, 'fieldName');

  let parsed;
  try {
    parsed = parse(content);
  } catch (err) {
    if (err && err.code === 'E_FRONTMATTER') {
      return false;
    }
    throw err;
  }

  if (!parsed.hasFrontMatter) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(parsed.data, fieldName);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  parse,
  serialize,
  mergeFrontMatter,
  hasField,
};
