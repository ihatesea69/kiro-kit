/**
 * Rebrander for the upstream kit Parity Sync.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 3 / 7.1–7.7 — string substitution + URL guard + npx-warning
 *        prepend + front-matter preserve + golden tests + Property 4 + 5.
 *
 * Trách nhiệm (design.md > Components and Interfaces > Porter + Rebrander):
 *
 *   Stateless, pure-string transform áp dụng theo thứ tự:
 *     1. `.claude/`   → `.kiro/`
 *     2. `the upstream kit`  → `KiroKit`
 *     3. `Claude Code` → `Kiro`  (TRỪ KHI target path nằm trong
 *        `skills/claude-code/` — file đó document Claude Code product nên
 *        phải giữ tên gốc, Req 11.2.)
 *
 *   Invariants (Property 4 — Rebrand Correctness):
 *     - URL khớp `https://*.claude.com/...` và `https://docs.anthropic.com/...`
 *       được bảo toàn nguyên văn (kể cả trong front-matter description).
 *     - Basename file không bị thay đổi bởi tool này (rule rename
 *       `CLAUDE.md` → `KIRO.md` thuộc về root-level porter task 17.4, KHÔNG
 *       phải Rebrander).
 *     - Khi gặp `npx claude-code`, prepend block comment NPX_WARNING ở đầu
 *       body (Req 11.5). Idempotent: nếu body đã có warning ở đầu, không
 *       thêm nữa.
 *
 *   Front-matter rules (Property 5 — Front-matter Round-trip):
 *     - Field `name`, `inclusion`, `argument-hint` được giữ NGUYÊN VĂN
 *       (không substitution). Đặc biệt `name: claude-code` không bị rebrand
 *       thành `name: kiro` (Req 11.2, 6.5, 3.5).
 *     - Các field khác (description, model, tools, ...) được áp dụng
 *       substitutions như body.
 *     - Re-serialize qua `lib/yaml-front-matter` (gray-matter wrapper).
 *
 * API:
 *   rebrand(content, options): string
 *
 *   `content`  : raw file content (string).
 *   `options`  : { targetPath?: string }
 *                  targetPath dùng để detect exception `skills/claude-code/`.
 *                  Nếu không cung cấp, mặc định áp dụng đầy đủ rule
 *                  (`Claude Code` → `Kiro`).
 *
 * Pure CommonJS, không I/O. An toàn để gọi nhiều lần (idempotent ở mức
 * "không leak pattern" — substitutions là string-replacement deterministic).
 */

'use strict';

const yamlFrontMatter = require('./lib/yaml-front-matter');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * URL preservation patterns. Bất kỳ URL nào match một trong hai pattern này
 * đều được trích vào placeholder TRƯỚC khi áp substitutions, rồi restore lại
 * NGUYÊN VĂN sau khi substitute. Điều này đảm bảo Property 4 invariant
 * "URL https://*.claude.com/... và https://docs.anthropic.com/... không bị
 * thay đổi".
 *
 * Stop characters: whitespace, `)`, `>`, `]`, `"`, `'`, `` ` ``. Đủ phổ biến
 * để dừng URL trong markdown (ngoặc đóng link `[txt](url)`, blockquote, code
 * fence) mà không cắt nhầm path có dấu `,`, `.` ở giữa.
 *
 * Cờ `gi`: global + case-insensitive. URL hiếm khi viết hoa nhưng case
 * insensitive là conservative.
 *
 * @type {RegExp}
 */
const URL_PROTECT_RE =
  /https:\/\/(?:[a-z0-9-]+\.)*claude\.com\/[^\s)>\]"'`]*|https:\/\/docs\.anthropic\.com\/[^\s)>\]"'`]*/gi;

/**
 * Comment block prepended khi body chứa `npx claude-code` (Req 11.5).
 * Text NGUYÊN VĂN — nó không được bị rebrand bởi chính tool (vì prepend SAU
 * khi substitution). Nội dung nhắc maintainer review xem có thay bằng
 * tương đương `kiro-kit` được không.
 *
 * @type {string}
 */
const NPX_WARNING =
  '<!-- KiroKit: this references Claude Code CLI; replace with kiro-kit equivalent if applicable -->';

/**
 * Detect `npx claude-code` (có thể có khoảng trắng, end-of-word). Lower-case
 * + hyphen — không match phrase `Claude Code`. `\b` đảm bảo không match
 * `claude-codepad` hay `claude-code-x`.
 *
 * @type {RegExp}
 */
const NPX_CLAUDE_CODE_RE = /npx\s+claude-code\b/;

/**
 * Front-matter fields giữ nguyên giá trị (không substitution). Tham chiếu:
 *   - Req 11.2: `name: claude-code` survive.
 *   - Req 3.5: `name`, `inclusion` của agent giữ nguyên.
 *   - Req 6.5: `argument-hint` của command giữ nguyên.
 *
 * Frozen để tránh mutate runtime.
 *
 * @type {ReadonlySet<string>}
 */
const FRONTMATTER_PRESERVE_FIELDS = Object.freeze(
  new Set(['name', 'inclusion', 'argument-hint']),
);

/**
 * Marker xác định file đang sống dưới `skills/claude-code/`. Khi targetPath
 * include marker này, phrase "Claude Code" KHÔNG bị thay thành "Kiro" vì
 * skill đó document Claude Code product (read-only reference, design > Bảng
 * phân loại > Skills > "Docs reference (read-only)").
 *
 * Substring match đủ — caller có thể truyền targetPath dạng
 * `presets/frontend/skills/claude-code/SKILL.md` hay
 * `skills/claude-code/references/foo.md`, đều match.
 *
 * @type {string}
 */
const CLAUDE_CODE_SKILL_MARKER = 'skills/claude-code/';

/**
 * Sentinel string cho URL placeholder. Sử dụng `\u0000` (NUL) — ký tự không
 * bao giờ xuất hiện trong markdown / source code hợp lệ, tránh va chạm.
 * Format: `\u0000URL_<idx>\u0000`.
 *
 * Restore qua `String.split(token).join(replacement)` (xem `restorePlaceholders`)
 * thay vì regex để tránh phải escape NUL trong RegExp.
 */
const URL_PLACEHOLDER_PREFIX = '\u0000URL_';
const URL_PLACEHOLDER_SUFFIX = '\u0000';

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
 * Detect xem `targetPath` có nằm trong subtree `skills/claude-code/` không.
 *
 * @param {string|undefined|null} targetPath
 * @returns {boolean}
 */
function isInClaudeCodeSkill(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    return false;
  }
  return targetPath.includes(CLAUDE_CODE_SKILL_MARKER);
}

/**
 * Trích các URL match `URL_PROTECT_RE` ra mảng placeholders, trả về string
 * mới với placeholder thay thế. Chia hai hàm (extract + restore) để gọi
 * cùng cặp mà không mutate state ngoài.
 *
 * @param {string} input
 * @returns {{ protectedString: string, placeholders: string[] }}
 */
function extractUrls(input) {
  const placeholders = [];
  // Reset stateful regex (g flag retains lastIndex giữa các call).
  URL_PROTECT_RE.lastIndex = 0;
  const protectedString = input.replace(URL_PROTECT_RE, (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `${URL_PLACEHOLDER_PREFIX}${idx}${URL_PLACEHOLDER_SUFFIX}`;
  });
  return { protectedString, placeholders };
}

/**
 * Restore URL placeholders. Sử dụng split+join để tránh phải escape NUL
 * trong regex. O(N * P) trong worst case (N = string length, P = placeholder
 * count), nhưng P thường rất nhỏ (< 20) nên không phải bottleneck.
 *
 * @param {string} input
 * @param {string[]} placeholders
 * @returns {string}
 */
function restorePlaceholders(input, placeholders) {
  if (placeholders.length === 0) {
    return input;
  }
  let out = input;
  for (let i = 0; i < placeholders.length; i++) {
    const token = `${URL_PLACEHOLDER_PREFIX}${i}${URL_PLACEHOLDER_SUFFIX}`;
    out = out.split(token).join(placeholders[i]);
  }
  return out;
}

/**
 * Apply core substitutions trên một string với URL protection.
 *
 * Thứ tự (deterministic):
 *   1. Path:    `.claude/`   → `.kiro/`
 *   2. Brand:   `the upstream kit`  → `KiroKit`
 *   3. Phrase:  `Claude Code` → `Kiro` (skip nếu inClaudeCodeSkill = true)
 *
 * Note: regex `/\.claude\//g` không match `.claude.com/` vì pattern yêu cầu
 * `/` ngay sau `claude` (không có `.com.` ở giữa). Dù vậy URL protection
 * vẫn được áp như defense-in-depth — Property 4 đảm bảo URL nguyên vẹn dù
 * regex substitution có thay đổi trong tương lai.
 *
 * @param {string} input
 * @param {boolean} inClaudeCodeSkill
 * @returns {string}
 */
function applySubstitutions(input, inClaudeCodeSkill) {
  const { protectedString, placeholders } = extractUrls(input);

  let out = protectedString.replace(/\.claude\//g, '.kiro/');
  out = out.replace(/the upstream kit/g, 'KiroKit');
  if (!inClaudeCodeSkill) {
    out = out.replace(/Claude Code/g, 'Kiro');
  }

  return restorePlaceholders(out, placeholders);
}

/**
 * Áp Rebrand Rule trên body markdown. Logic:
 *   1. Detect `npx claude-code` trong body NGUYÊN BẢN (trước substitution).
 *   2. Áp substitutions.
 *   3. Nếu detected ở bước 1, prepend NPX_WARNING + '\n' (idempotent —
 *      bỏ qua nếu body đã start bằng warning).
 *
 * @param {string} body
 * @param {boolean} inClaudeCodeSkill
 * @returns {string}
 */
function rebrandBody(body, inClaudeCodeSkill) {
  // Reset stateful regex trước test (NPX_CLAUDE_CODE_RE không có flag `g`
  // nên lastIndex luôn 0, nhưng giữ pattern an toàn).
  const hasNpxClaudeCode = NPX_CLAUDE_CODE_RE.test(body);

  let rebranded = applySubstitutions(body, inClaudeCodeSkill);

  if (hasNpxClaudeCode && !rebranded.startsWith(NPX_WARNING)) {
    // Prepend warning + newline. Nếu body rỗng (edge case) thì kết quả là
    // `<warning>\n` — vẫn đúng vì test detect đã pass nên body có content.
    rebranded = `${NPX_WARNING}\n${rebranded}`;
  }

  return rebranded;
}

/**
 * Áp Rebrand Rule lên front-matter values theo policy preserve/transform.
 *
 * Strategy:
 *   - Field name nằm trong FRONTMATTER_PRESERVE_FIELDS ⇒ giữ value NGUYÊN
 *     (kể cả khi value là object/array).
 *   - Field khác:
 *     - String value ⇒ áp `applySubstitutions`.
 *     - Object/Array value ⇒ recurse, mỗi key con tự kiểm preserve list
 *       (key nesting hiếm gặp trong front-matter agent/command/skill).
 *     - Primitive khác (number, boolean, null) ⇒ giữ nguyên.
 *
 * Recursion vào nested object KHÔNG check preserve list vì các field
 * `name`/`inclusion`/`argument-hint` chỉ có ý nghĩa ở top level. Nếu spec
 * sau này yêu cầu preserve nested fields, mở rộng `preserveSet` argument.
 *
 * @param {Record<string, unknown>} data
 * @param {boolean} inClaudeCodeSkill
 * @returns {Record<string, unknown>} Object MỚI, không mutate input.
 */
function rebrandFrontMatter(data, inClaudeCodeSkill) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (FRONTMATTER_PRESERVE_FIELDS.has(key)) {
      out[key] = value;
      continue;
    }
    out[key] = transformValue(value, inClaudeCodeSkill);
  }
  return out;
}

/**
 * Recursive transform cho front-matter value (không phải top-level field).
 * Áp substitutions trên mọi string leaf; pass-through primitive khác.
 *
 * @param {unknown} value
 * @param {boolean} inClaudeCodeSkill
 * @returns {unknown}
 */
function transformValue(value, inClaudeCodeSkill) {
  if (typeof value === 'string') {
    return applySubstitutions(value, inClaudeCodeSkill);
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformValue(item, inClaudeCodeSkill));
  }
  if (value !== null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const obj = {};
    for (const k of Object.keys(/** @type {Record<string, unknown>} */ (value))) {
      obj[k] = transformValue(
        /** @type {Record<string, unknown>} */ (value)[k],
        inClaudeCodeSkill,
      );
    }
    return obj;
  }
  // number, boolean, null, undefined → nguyên xi.
  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rebrand một file content theo Rebrand Rule.
 *
 * Pipeline:
 *   1. Parse front-matter qua `yamlFrontMatter.parse`. Nếu malformed
 *      (E_FRONTMATTER), treat như không có front-matter (return body sau
 *      rebrand). Lý do: Porter (task 10.3) sẽ skip file front-matter
 *      malformed riêng; ở đây Rebrander vẫn fail-safe để golden test cover
 *      được "non-frontmatter content".
 *   2. Rebrand front-matter values (preserve `name`, `inclusion`,
 *      `argument-hint`).
 *   3. Rebrand body (URL protect + substitutions + npx warning prepend).
 *   4. Re-serialize qua `yamlFrontMatter.serialize`.
 *
 * @param {string} content Source file content.
 * @param {{ targetPath?: string }} [options] Path target trong filesystem,
 *   dùng để phát hiện exception `skills/claude-code/`. Mặc định không có
 *   exception.
 * @returns {string} Content đã rebrand.
 * @throws {TypeError} Nếu `content` không phải string.
 *
 * @example
 *   rebrand('Use the upstream kit.', {});
 *   // => 'Use KiroKit.'
 *
 *   rebrand('---\nname: claude-code\n---\nbody', { targetPath: 'skills/claude-code/SKILL.md' });
 *   // => '---\nname: claude-code\n---\nbody\n'  (Claude Code phrase preserved)
 */
function rebrand(content, options) {
  assertString(content, 'content');
  const targetPath = options && typeof options.targetPath === 'string' ? options.targetPath : '';
  const inClaudeCodeSkill = isInClaudeCodeSkill(targetPath);

  let parsed;
  try {
    parsed = yamlFrontMatter.parse(content);
  } catch (err) {
    if (err && err.code === 'E_FRONTMATTER') {
      // Fail-safe: treat như không có front-matter, chỉ rebrand body.
      return rebrandBody(content, inClaudeCodeSkill);
    }
    throw err;
  }

  const rebrandedData = rebrandFrontMatter(parsed.data, inClaudeCodeSkill);
  const rebrandedBody = rebrandBody(parsed.body, inClaudeCodeSkill);

  return yamlFrontMatter.serialize(rebrandedData, rebrandedBody);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  rebrand,
  // Exposed để golden tests + property tests assert chi tiết. Không thuộc
  // public surface của Porter (Porter chỉ gọi `rebrand`).
  NPX_WARNING,
  CLAUDE_CODE_SKILL_MARKER,
  FRONTMATTER_PRESERVE_FIELDS,
  URL_PROTECT_RE,
};
