/**
 * Reporter for the upstream kit Parity Sync.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 4 / 12.1–12.5 — sinh ba file output:
 *
 *   - `delta-report.md`         (task 12.1) — bảng tổng kết per-preset +
 *                               chi tiết per-pair sort `(preset, source.path)`.
 *   - `conflict-log.md`         (task 12.2) — entry per-decision với
 *                               `target_path`, `decision`, `reason`, source/
 *                               target hash, ISO 8601 timestamp.
 *   - `parity-sync-report.md`   (task 12.3) — YAML front-matter chứa
 *                               `timestamp` + `ranAt`, bảng before/after
 *                               count per preset, top 20 manual-review.
 *   - Property 11 final check   (task 12.4) — `assertNoEmojiNoPII`: scan
 *                               output sau render để bảo đảm không có emoji
 *                               (Req 1.6, 16.1) hoặc PII pattern (email,
 *                               E.164 phone — Req 16.3).
 *   - Snapshot tests fixture    (task 12.5) — 3 deterministic input → 3
 *                               expected report markdown ở
 *                               `__tests__/unit/reporter.test.js`.
 *
 * Trách nhiệm (design.md > Components and Interfaces > Reporter):
 *
 *   "Reporter tổng hợp kết quả từ stage 2 (delta-report.md), stage 5
 *    (conflict-log.md), và toàn bộ pipeline (parity-sync-report.md). Mỗi
 *    report bắt đầu bằng timestamp ISO 8601 trong front-matter để không
 *    ảnh hưởng nội dung file artifact (Req 15.2)."
 *
 *   "Cả ba file: no emoji (Req 1.6, 16.1, 17.4)."
 *
 * Idempotency contract (Req 15.1, Req 15.2, Property 10):
 *
 *   - `delta-report.md` KHÔNG chứa timestamp → byte-stable cross-run với
 *     cùng input `DeltaEntry[]`.
 *   - `conflict-log.md` chứa timestamp PER ENTRY (set bởi ConflictResolver
 *     khi resolve một conflict). Hai run liên tiếp sẽ có timestamp giống
 *     nhau cho cùng decision khi caller pass cùng `decisions[]` (deterministic
 *     khi resolver no-op cho hash-equal sources). Reporter chỉ format,
 *     không sinh timestamp mới.
 *   - `parity-sync-report.md` chứa `timestamp` + `ranAt` ở YAML front-matter
 *     duy nhất; body deterministic. Hai run liên tiếp với cùng `runResult`
 *     và cùng `runResult.ranAt` cho ra cùng bytes (xem Property 10:
 *     "Timestamp được ghi vào delta-report.md [front-matter] và
 *     parity-sync-report.md ở front-matter, KHÔNG vào file artifact").
 *
 * Determinism rules:
 *
 *   - Sort delta entries `(target_preset, source_path)` ascending bằng
 *     `Intl.Collator`-equivalent (string `<`/`>`) — đảm bảo ổn định
 *     cross-locale.
 *   - Sort conflict entries theo `target_path` ascending. Sort manual-review
 *     paths cũng ascending để top-20 ổn định.
 *   - Tất cả output dùng line-feed (`\n`) thuần, không CRLF — khớp với
 *     `manifest-updater.serialize` và Git source-of-truth (autocrlf trên
 *     Windows sẽ convert khi commit nếu repo cấu hình vậy).
 *   - JSON serialize KHÔNG ghi BOM, không trailing whitespace, không
 *     locale-dependent number format (.toString() default cho integer).
 *
 * Output paths (mặc định, design.md > Định vị tool trong repo):
 *
 *   docs/audits/upstream-parity/
 *     delta-report.md
 *     conflict-log.md
 *     parity-sync-report.md
 *
 * Pure CommonJS, sync I/O. `writeReports` orchestrate ba file writes qua
 * `atomic-writer.writeAtomic` (Req 15.3, atomic tmp+rename).
 *
 * @typedef {import('./conflict-resolver').ConflictDecision} ConflictDecision
 *
 * @typedef {object} DeltaEntry
 *   Re-imported từ delta-detector.js + category-mapper.js. Shape:
 *     { source_id, source_path, target_preset, target_path,
 *       status: 'present' | 'missing' | 'partial' | 'category-skip',
 *       reason?: string,
 *       source_lines: number,
 *       target_lines?: number }
 *
 * @typedef {object} ParityRunResult
 *   Tổng kết toàn pipeline (design.md > Data Models > ParityRunResult).
 *   Shape:
 *     { ranAt: string,                                  // ISO 8601
 *       presets: PresetName[],
 *       totals: { ported, skipped, conflicts, manualReviewPending },
 *       perPreset: Record<PresetName,
 *         { before: { agents, skills, commands, hooks, workflows },
 *           after:  { agents, skills, commands, hooks, workflows } }>,
 *       manualReview: string[]                          // sidecar paths
 *     }
 */

'use strict';

const path = require('path');

const atomicWriter = require('./atomic-writer');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Status enum của DeltaEntry. Thứ tự cố định trong header bảng Summary để
 * column ổn định cross-render: missing | partial | category-skip | present.
 *
 * Lý do thứ tự:
 *   - `missing` đầu tiên: đó là gap chính cần port.
 *   - `partial` kế tiếp: skill thiếu subdir, ưu tiên xử lý sau missing.
 *   - `category-skip`: filtered intentionally, đặt giữa cho dễ scan.
 *   - `present`: counterfactual baseline, để cuối.
 *
 * @type {ReadonlyArray<'missing' | 'partial' | 'category-skip' | 'present'>}
 */
const STATUS_HEADERS = Object.freeze(['missing', 'partial', 'category-skip', 'present']);

/**
 * Thứ tự preset cố định trong cả Summary table và Details section. Khớp với
 * `VALID_PRESETS` của `lib/path-utils` (6 chính + `_template`); `_template`
 * đặt cuối vì là skeleton internal, không user-facing.
 *
 * Sort theo thứ tự này thay vì alphabetical để đọc tự nhiên hơn (frontend
 * → backend → fullstack → ...) và stable cross-render.
 *
 * @type {ReadonlyArray<string>}
 */
const PRESET_ORDER = Object.freeze([
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', '_template',
]);

/**
 * Manual-review pending top-N. Req 17.3: "liệt kê tối đa 20 file đầu tiên".
 *
 * @type {number}
 */
const MANUAL_REVIEW_TOP_N = 20;

/**
 * Output directory mặc định cho 3 file report. Khớp với design.md > Định
 * vị tool trong repo.
 *
 * @type {string}
 */
const DEFAULT_OUTPUT_DIR = 'docs/audits/upstream-parity';

/**
 * Tên file output cố định.
 *
 * @type {Readonly<{ delta: string, conflict: string, run: string }>}
 */
const REPORT_FILENAMES = Object.freeze({
  delta: 'delta-report.md',
  conflict: 'conflict-log.md',
  run: 'parity-sync-report.md',
});

/**
 * Decision types được liệt kê trong `conflict-log.md`. Req 12.5: "ghi log
 * mọi quyết định vào conflict-log.md". Tuy nhiên `no-op` (hash equal —
 * không phải conflict thực) bị loại để log gọn — entry no-op không có giá
 * trị review, gây nhiễu.
 *
 * Set frozen cho O(1) lookup.
 *
 * @type {ReadonlySet<string>}
 */
const LOGGABLE_DECISIONS = Object.freeze(new Set([
  'write-new',
  'kept-target',
  'merged-frontmatter',
  'sidecar',
  'json-merged',
]));

/**
 * Emoji regex theo Req 1.6 / 16.1 / 19.3 / Property 11. Bao phủ:
 *   - U+1F300..U+1FAFF: Symbols and Pictographs Extended-A + emoji range.
 *   - U+2600..U+27BF: Miscellaneous Symbols + Dingbats (✓, ✗, ★, etc.).
 *
 * Flag `u` (Unicode) yêu cầu cho range syntax `\u{...}`.
 *
 * @type {RegExp}
 */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

/**
 * Email pattern (RFC-5322 simplified). Đủ để catch literal email trong
 * content; không nhằm match-all-RFC-5322. Word-boundary ở hai đầu giảm
 * false positive với chuỗi như `foo@bar` không phải email thực.
 *
 * Lưu ý: hostname tối thiểu phải có dấu chấm (`example.com`) để loại
 * "user@local" intra-network không phải PII trong content production.
 *
 * @type {RegExp}
 */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

/**
 * Phone E.164 pattern (Req 16.3). E.164 spec: `+` followed by 1-15 digits.
 * Word boundary ở cuối tránh match số dài hơn 15 digit. `(?<!\\d)` ở đầu
 * tránh match `123+456` (toán học) — yêu cầu `+` đứng đầu hoặc sau ký tự
 * không phải digit.
 *
 * Ngưỡng 7 digit minimum: tránh false positive với số version (`+8` trong
 * `>=v8`) — số phone thực tế tối thiểu 7 digit (số nội bộ nhỏ nhất), ITU
 * khuyến nghị 8-15 cho international.
 *
 * @type {RegExp}
 */
const PHONE_E164_RE = /(?<!\d)\+\d{7,15}\b/;

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/**
 * Sort comparator cho DeltaEntry theo `(target_preset, source_path)`
 * ascending. Stable: ES2019+ guarantee `Array.prototype.sort` stable trên
 * V8/JSC.
 *
 * Thứ tự preset dùng `PRESET_ORDER` index thay vì alphabetical (frontend
 * < backend → 0 < 1, không phải alphabetical b<f). Preset không nằm trong
 * `PRESET_ORDER` (defensive — không xảy ra với DeltaDetector hiện tại)
 * được đặt cuối với index = `PRESET_ORDER.length`.
 *
 * @param {DeltaEntry} a
 * @param {DeltaEntry} b
 * @returns {number}
 */
function compareDeltaEntries(a, b) {
  const ai = PRESET_ORDER.indexOf(a.target_preset);
  const bi = PRESET_ORDER.indexOf(b.target_preset);
  const aOrder = ai === -1 ? PRESET_ORDER.length : ai;
  const bOrder = bi === -1 ? PRESET_ORDER.length : bi;
  if (aOrder !== bOrder) return aOrder - bOrder;
  // Within same preset: alphabetical source_path ascending.
  if (a.source_path < b.source_path) return -1;
  if (a.source_path > b.source_path) return 1;
  return 0;
}

/**
 * Sort comparator cho ConflictDecision theo `target_path` ascending. Đảm
 * bảo conflict-log.md ổn định cross-render (Idempotency, Property 10).
 *
 * @param {ConflictDecision} a
 * @param {ConflictDecision} b
 * @returns {number}
 */
function compareDecisionsByTarget(a, b) {
  const ta = typeof a.target_path === 'string' ? a.target_path : '';
  const tb = typeof b.target_path === 'string' ? b.target_path : '';
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

/**
 * Strip prefix `presets/` khỏi target_path để hiển thị trong heading
 * conflict-log: `presets/frontend/agents/x.md` → `frontend/agents/x.md`.
 *
 * Idempotent: input đã ở form preset-relative trả về nguyên si.
 *
 * @param {string} targetPath
 * @returns {string}
 */
function stripPresetsPrefix(targetPath) {
  if (typeof targetPath !== 'string') return '';
  const PREFIX = 'presets/';
  if (targetPath.startsWith(PREFIX)) {
    return targetPath.slice(PREFIX.length);
  }
  return targetPath;
}

/**
 * Format reason cho status `partial` từ `reason` field của DeltaEntry.
 *
 * Convention từ `delta-detector.js > computeMissingSkillSubdirs`:
 *   - 'missing-subdir-references'         → 'missing references/'
 *   - 'missing-subdir-scripts'            → 'missing scripts/'
 *   - 'missing-subdir-references-scripts' → 'missing references/, scripts/'
 *
 * Nếu reason không match prefix `missing-subdir-`, fallback về reason
 * nguyên văn — tolerant với reason format mới phát sinh trong tương lai.
 *
 * @param {string} reason
 * @returns {string} Human-readable parenthetical content (KHÔNG có dấu `()`).
 */
function formatPartialReason(reason) {
  if (typeof reason !== 'string' || reason === '') return 'partial';
  const PREFIX = 'missing-subdir-';
  if (!reason.startsWith(PREFIX)) return reason;
  const subdirs = reason.slice(PREFIX.length).split('-').filter(Boolean);
  if (subdirs.length === 0) return reason;
  return 'missing ' + subdirs.map((s) => `${s}/`).join(', ');
}

/**
 * Group deltas theo `target_preset`. Trong mỗi group, entries giữ nguyên
 * thứ tự xuất hiện sau khi sort. Output ổn định cross-render.
 *
 * @param {DeltaEntry[]} sortedDeltas Đã sort qua `compareDeltaEntries`.
 * @returns {Map<string, DeltaEntry[]>}
 */
function groupByPreset(sortedDeltas) {
  /** @type {Map<string, DeltaEntry[]>} */
  const out = new Map();
  for (const preset of PRESET_ORDER) {
    out.set(preset, []);
  }
  for (const d of sortedDeltas) {
    if (!d || typeof d !== 'object') continue;
    const preset = d.target_preset;
    if (!out.has(preset)) {
      out.set(preset, []); // defensive — preset ngoài PRESET_ORDER.
    }
    out.get(preset).push(d);
  }
  return out;
}

/**
 * Đếm số entry per status trong một group.
 *
 * @param {DeltaEntry[]} entries
 * @returns {Record<string, number>} Key trong STATUS_HEADERS + 'total'.
 */
function countByStatus(entries) {
  /** @type {Record<string, number>} */
  const counts = { missing: 0, partial: 0, 'category-skip': 0, present: 0 };
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(counts, e.status)) {
      counts[e.status] += 1;
    }
  }
  return counts;
}

/**
 * Format một dòng detail cho DeltaEntry. Format khớp với design.md spec:
 *
 *   - missing:      `- [missing] <source> (size_lines=N) -> <target>`
 *   - partial:      `- [partial] <source> (<formatted-reason>) -> <target>`
 *   - category-skip:`- [category-skip] <source> (reason: <reason>)`
 *   - present:      `- [present] <source> -> <target>` (ít khi xuất hiện
 *                    trong details vì chỉ đếm trong summary; render khi
 *                    có để giữ tính toàn vẹn).
 *
 * Lý do KHÔNG hiển thị `-> <target>` cho category-skip: target file không
 * được tạo, đường dẫn target chỉ gây nhiễu (target_path vẫn là
 * `presets/<P>/<source>` về mặt formal nhưng không tồn tại trên đĩa).
 *
 * @param {DeltaEntry} entry
 * @returns {string} Dòng đơn (không trailing newline).
 */
function formatDetailLine(entry) {
  const src = entry.source_path;
  const tgt = entry.target_path;
  switch (entry.status) {
    case 'missing': {
      const lines = typeof entry.source_lines === 'number' ? entry.source_lines : 0;
      return `- [missing] ${src} (size_lines=${lines}) -> ${tgt}`;
    }
    case 'partial': {
      const reason = formatPartialReason(entry.reason || '');
      return `- [partial] ${src} (${reason}) -> ${tgt}`;
    }
    case 'category-skip': {
      const reason = typeof entry.reason === 'string' && entry.reason !== ''
        ? entry.reason
        : 'unspecified';
      return `- [category-skip] ${src} (reason: ${reason})`;
    }
    case 'present':
    default: {
      const tail = typeof entry.target_lines === 'number'
        ? ` (target_lines=${entry.target_lines})`
        : '';
      return `- [present] ${src}${tail} -> ${tgt}`;
    }
  }
}

/**
 * Build markdown table row với pipe-separated cells. Cells được trim
 * trailing whitespace và escape không cần thiết vì input là số / preset
 * name (an toàn).
 *
 * @param {ReadonlyArray<string|number>} cells
 * @returns {string}
 */
function tableRow(cells) {
  return '| ' + cells.map((c) => String(c)).join(' | ') + ' |';
}

/**
 * Serialize ParityRunResult per-preset counts row. Format:
 *   `| frontend | 12/16 | 20/28 | 25/40 | 6/6 | 4/4 |`
 *
 * @param {string} preset
 * @param {{ before: object, after: object }} counts
 * @returns {string}
 */
function perPresetRow(preset, counts) {
  const before = counts && counts.before ? counts.before : {};
  const after = counts && counts.after ? counts.after : {};
  const cell = (key) => {
    const b = typeof before[key] === 'number' ? before[key] : 0;
    const a = typeof after[key] === 'number' ? after[key] : 0;
    return `${b}/${a}`;
  };
  return tableRow([
    preset,
    cell('agents'),
    cell('skills'),
    cell('commands'),
    cell('hooks'),
    cell('workflows'),
  ]);
}

/**
 * Format YAML front-matter cho parity-sync-report.md. Chỉ chứa hai field
 * `timestamp` + `ranAt` (cùng giá trị về mặt logic, redundant cho rõ
 * ràng — `timestamp` là khi report được render, `ranAt` là khi pipeline
 * bắt đầu chạy; trong implementation hiện tại Reporter render ngay sau
 * pipeline finish nên hai giá trị bằng nhau, nhưng tách field cho phép
 * future split).
 *
 * Output:
 *   ```
 *   ---
 *   timestamp: 2026-XX-XXTXX:XX:XXZ
 *   ranAt: 2026-XX-XXTXX:XX:XXZ
 *   ---
 *   ```
 *
 * @param {string} timestamp ISO 8601 (caller-supplied).
 * @param {string} ranAt     ISO 8601.
 * @returns {string} Block YAML kết thúc bằng `\n---\n`.
 */
function buildFrontMatter(timestamp, ranAt) {
  return `---\ntimestamp: ${timestamp}\nranAt: ${ranAt}\n---\n`;
}

// ---------------------------------------------------------------------------
// Public API: renderDeltaReport (task 12.1)
// ---------------------------------------------------------------------------

/**
 * Render `delta-report.md` từ `DeltaEntry[]`.
 *
 * Output format (deterministic, không timestamp — Req 15.2 idempotency):
 *
 *   # the upstream kit Parity Sync — Delta Report
 *
 *   ## Summary
 *
 *   | Preset    | missing | partial | category-skip | present |
 *   |-----------|---------|---------|---------------|---------|
 *   | frontend  |   N1    |   N2    |       N3      |    N4   |
 *   ...
 *
 *   ## Details
 *
 *   ### frontend
 *
 *   - [missing] agents/brainstormer.md (size_lines=101) -> presets/frontend/agents/brainstormer.md
 *   - [partial] skills/aesthetic/SKILL.md (missing references/) -> presets/frontend/skills/aesthetic/SKILL.md
 *   - [category-skip] skills/payment-integration/SKILL.md (reason: backend-only)
 *
 *   ### backend
 *   ...
 *
 * Determinism:
 *   - Sort by `(target_preset, source_path)` ascending; preset order theo
 *     `PRESET_ORDER` (frontend, backend, fullstack, mobile, devops, data-ai,
 *     _template).
 *   - Status thứ tự cố định trong Summary header: missing | partial |
 *     category-skip | present.
 *   - Preset không có entry vẫn xuất hiện trong Summary table (count = 0)
 *     để columns ổn định.
 *   - Preset không có entry KHÔNG xuất hiện trong Details section (giảm
 *     nhiễu), thay bằng "(no entries)" placeholder để vẫn deterministic.
 *
 * @param {DeltaEntry[]} deltas
 * @returns {string} Markdown content kết thúc bằng `\n` (POSIX EOF).
 * @throws {TypeError} deltas không phải array.
 */
function renderDeltaReport(deltas) {
  if (!Array.isArray(deltas)) {
    throw new TypeError('renderDeltaReport: deltas phải là DeltaEntry[].');
  }

  // Defensive copy + sort. KHÔNG mutate input.
  const sorted = deltas.slice().sort(compareDeltaEntries);
  const grouped = groupByPreset(sorted);

  /** @type {string[]} */
  const lines = [];
  lines.push('# the upstream kit Parity Sync — Delta Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(tableRow(['Preset', ...STATUS_HEADERS]));
  lines.push(tableRow(['------', '-------', '-------', '-------------', '-------']));

  for (const preset of PRESET_ORDER) {
    const entries = grouped.get(preset) || [];
    const counts = countByStatus(entries);
    lines.push(tableRow([
      preset,
      counts.missing,
      counts.partial,
      counts['category-skip'],
      counts.present,
    ]));
  }

  lines.push('');
  lines.push('## Details');
  lines.push('');

  for (const preset of PRESET_ORDER) {
    const entries = grouped.get(preset) || [];
    lines.push(`### ${preset}`);
    lines.push('');
    if (entries.length === 0) {
      lines.push('- (no entries)');
    } else {
      for (const e of entries) {
        lines.push(formatDetailLine(e));
      }
    }
    lines.push('');
  }

  // Trim trailing blank lines, đảm bảo file kết thúc bằng exactly một `\n`.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public API: renderConflictLog (task 12.2)
// ---------------------------------------------------------------------------

/**
 * Render `conflict-log.md` từ `ConflictDecision[]`.
 *
 * Output format:
 *
 *   # the upstream kit Parity Sync — Conflict Log
 *
 *   ## frontend/agents/code-reviewer.md
 *
 *   - decision: kept-target
 *   - reason: target_lines (164) > 1.5 × source_lines (98)
 *   - source_hash: <sha256>
 *   - target_hash: <sha256>
 *   - timestamp: 2026-XX-XXTXX:XX:XXZ
 *
 *   ## frontend/skills/aesthetic/SKILL.md
 *   ...
 *
 * Determinism + scope:
 *   - Skip decisions có `decision === 'no-op'` (hash-equal — không phải
 *     conflict thực, log entry sẽ gây nhiễu).
 *   - Sort theo `target_path` ascending để diff ổn định cross-render.
 *   - Heading dùng `<preset>/<rest>` (strip `presets/` prefix) để gọn.
 *   - `target_hash` có thể null khi `decision === 'write-new'` (target
 *     chưa tồn tại); render là chuỗi `null` literal.
 *   - Body decision rỗng (không có loggable decision nào) ⇒ render header
 *     + dòng "(no conflicts logged)" để file vẫn tồn tại và parseable.
 *
 * @param {ConflictDecision[]} decisions
 * @returns {string}
 * @throws {TypeError} decisions không phải array.
 */
function renderConflictLog(decisions) {
  if (!Array.isArray(decisions)) {
    throw new TypeError('renderConflictLog: decisions phải là ConflictDecision[].');
  }

  // Filter loggable decisions + defensive copy.
  const loggable = decisions
    .filter((d) => d && typeof d === 'object' && LOGGABLE_DECISIONS.has(d.decision))
    .slice()
    .sort(compareDecisionsByTarget);

  /** @type {string[]} */
  const lines = [];
  lines.push('# the upstream kit Parity Sync — Conflict Log');
  lines.push('');

  if (loggable.length === 0) {
    lines.push('(no conflicts logged)');
    return lines.join('\n') + '\n';
  }

  for (const d of loggable) {
    const heading = stripPresetsPrefix(d.target_path);
    lines.push(`## ${heading}`);
    lines.push('');
    lines.push(`- decision: ${d.decision}`);
    lines.push(`- reason: ${typeof d.reason === 'string' ? d.reason : ''}`);
    lines.push(`- source_hash: ${typeof d.source_hash === 'string' ? d.source_hash : ''}`);
    lines.push(`- target_hash: ${d.target_hash === null ? 'null' : (typeof d.target_hash === 'string' ? d.target_hash : '')}`);
    lines.push(`- timestamp: ${typeof d.timestamp === 'string' ? d.timestamp : ''}`);
    if (d.decision === 'sidecar' && typeof d.sidecar_path === 'string' && d.sidecar_path !== '') {
      lines.push(`- sidecar_path: ${stripPresetsPrefix(d.sidecar_path)}`);
    }
    lines.push('');
  }

  // Trim trailing blank, single trailing `\n`.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public API: renderParitySyncReport (task 12.3)
// ---------------------------------------------------------------------------

/**
 * Render `parity-sync-report.md` từ `ParityRunResult`.
 *
 * Output format:
 *
 *   ---
 *   timestamp: 2026-XX-XXTXX:XX:XXZ
 *   ranAt: 2026-XX-XXTXX:XX:XXZ
 *   ---
 *
 *   # the upstream kit Parity Sync — Run Report
 *
 *   ## Totals
 *
 *   - Files ported: N
 *   - Files skipped: N
 *   - Conflicts resolved: N
 *   - Manual review pending: N
 *
 *   ## Per-Preset Counts (Before vs After)
 *
 *   | Preset    | agents B/A | skills B/A | commands B/A | hooks B/A | workflows B/A |
 *   |-----------|------------|------------|--------------|-----------|---------------|
 *   | frontend  | 12/16      | 20/28      | 25/40        | 6/6       | 4/4           |
 *   ...
 *
 *   ## Manual Review Pending (top 20)
 *
 *   - presets/frontend/agents/code-reviewer.source.md
 *   - presets/backend/skills/databases/SKILL.source.md
 *   ...
 *
 * Determinism:
 *   - `timestamp` lấy từ caller (`runResult.ranAt`) → cùng input, cùng
 *     output bytes (Property 10).
 *   - Per-preset rows theo `PRESET_ORDER`; preset không có data render
 *     `0/0` cho mọi cell.
 *   - Manual review sort ascending, slice top 20.
 *
 * Validation:
 *   - `runResult.ranAt` phải là ISO 8601 string non-empty (defensive
 *     check; format không enforce strict — caller responsibility).
 *
 * @param {ParityRunResult} runResult
 * @returns {string}
 * @throws {TypeError} runResult shape không hợp lệ.
 */
function renderParitySyncReport(runResult) {
  if (!runResult || typeof runResult !== 'object') {
    throw new TypeError('renderParitySyncReport: runResult phải là object.');
  }
  if (typeof runResult.ranAt !== 'string' || runResult.ranAt === '') {
    throw new TypeError(
      'renderParitySyncReport: runResult.ranAt phải là ISO 8601 string non-empty.',
    );
  }

  const totals = runResult.totals && typeof runResult.totals === 'object'
    ? runResult.totals
    : {};
  const ported = typeof totals.ported === 'number' ? totals.ported : 0;
  const skipped = typeof totals.skipped === 'number' ? totals.skipped : 0;
  const conflicts = typeof totals.conflicts === 'number' ? totals.conflicts : 0;
  const manualReviewPending = typeof totals.manualReviewPending === 'number'
    ? totals.manualReviewPending
    : 0;

  const perPreset = runResult.perPreset && typeof runResult.perPreset === 'object'
    ? runResult.perPreset
    : {};

  const manualReview = Array.isArray(runResult.manualReview)
    ? runResult.manualReview.slice().sort()
    : [];
  const topManualReview = manualReview.slice(0, MANUAL_REVIEW_TOP_N);

  /** @type {string[]} */
  const lines = [];

  // Front-matter — `timestamp` và `ranAt` đều dùng `runResult.ranAt` để
  // bytes ổn định cross-render với cùng runResult input.
  lines.push(buildFrontMatter(runResult.ranAt, runResult.ranAt).trimEnd());
  lines.push('');

  lines.push('# the upstream kit Parity Sync — Run Report');
  lines.push('');

  lines.push('## Totals');
  lines.push('');
  lines.push(`- Files ported: ${ported}`);
  lines.push(`- Files skipped: ${skipped}`);
  lines.push(`- Conflicts resolved: ${conflicts}`);
  lines.push(`- Manual review pending: ${manualReviewPending}`);
  lines.push('');

  lines.push('## Per-Preset Counts (Before vs After)');
  lines.push('');
  lines.push(tableRow(['Preset', 'agents B/A', 'skills B/A', 'commands B/A', 'hooks B/A', 'workflows B/A']));
  lines.push(tableRow(['------', '----------', '----------', '------------', '---------', '-------------']));
  for (const preset of PRESET_ORDER) {
    if (preset === '_template') continue; // skeleton, không port nội dung
    const counts = perPreset[preset];
    lines.push(perPresetRow(preset, counts || { before: {}, after: {} }));
  }
  lines.push('');

  lines.push('## Manual Review Pending (top 20)');
  lines.push('');
  if (topManualReview.length === 0) {
    lines.push('- (none)');
  } else {
    for (const p of topManualReview) {
      lines.push(`- ${p}`);
    }
  }

  // Trim trailing blank, single trailing `\n`.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public API: assertNoEmojiNoPII (task 12.4 — Property 11 final check)
// ---------------------------------------------------------------------------

/**
 * Scan `content` cho emoji + PII pattern. Throw `Error` với
 * `code === 'E_REPORTER_EMOJI_OR_PII'` nếu match được.
 *
 * Property 11 (design.md): "không file output `.md`, `.json`, hoặc script
 * trong `presets/` và `docs/audits/upstream-parity/` chứa emoji hoặc
 * PII pattern".
 *
 * Patterns được check:
 *   - Emoji (Req 1.6, 16.1):
 *       /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
 *   - Email (Req 16.3):
 *       RFC-5322 simplified — `local@domain.tld` với TLD ≥ 2 chars.
 *   - Phone E.164 (Req 16.3):
 *       `+` followed by 7-15 digits, word boundary cuối.
 *
 * Defense-in-depth: Reporter chỉ format từ deterministic data của các
 * stage trước (DeltaEntry, ConflictDecision, ParityRunResult). Nếu PII
 * lọt vào, root cause là source data hoặc transform earlier — assert ở
 * đây catch sớm trước khi report được commit.
 *
 * Lý do KHÔNG check "real-name placeholder": pattern này gây quá nhiều
 * false positive với content technical (ví dụ "John Doe" trong fixture
 * docs có thể bị flag). Real-name detection cần ML hoặc whitelist; out
 * of scope cho final check. Req 16.3 đã specify "placeholder" như
 * `[name]` là target — không phải pattern detect.
 *
 * @param {string} content Markdown content (chưa ghi đĩa).
 * @param {object} [opts]
 * @param {string} [opts.label] Tên file để gắn vào error message (ví dụ
 *        'delta-report.md'). Default 'content'.
 * @returns {void} Trả undefined khi pass.
 * @throws {TypeError} content không phải string.
 * @throws {Error}     `code === 'E_REPORTER_EMOJI_OR_PII'` khi match.
 */
function assertNoEmojiNoPII(content, opts) {
  if (typeof content !== 'string') {
    throw new TypeError('assertNoEmojiNoPII: content phải là string.');
  }
  const label = opts && typeof opts.label === 'string' && opts.label !== ''
    ? opts.label
    : 'content';

  const emojiMatch = EMOJI_RE.exec(content);
  if (emojiMatch) {
    const err = new Error(
      `Emoji detected in ${label}: U+${emojiMatch[0].codePointAt(0).toString(16).toUpperCase()} `
      + `at position ${emojiMatch.index}.`,
    );
    err.code = 'E_REPORTER_EMOJI_OR_PII';
    err.kind = 'emoji';
    err.position = emojiMatch.index;
    throw err;
  }

  const emailMatch = EMAIL_RE.exec(content);
  if (emailMatch) {
    const err = new Error(
      `PII (email) detected in ${label}: "${emailMatch[0]}" at position ${emailMatch.index}.`,
    );
    err.code = 'E_REPORTER_EMOJI_OR_PII';
    err.kind = 'email';
    err.position = emailMatch.index;
    throw err;
  }

  const phoneMatch = PHONE_E164_RE.exec(content);
  if (phoneMatch) {
    const err = new Error(
      `PII (phone E.164) detected in ${label}: "${phoneMatch[0]}" at position ${phoneMatch.index}.`,
    );
    err.code = 'E_REPORTER_EMOJI_OR_PII';
    err.kind = 'phone';
    err.position = phoneMatch.index;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API: writeReports (orchestrator)
// ---------------------------------------------------------------------------

/**
 * Render và ghi cả ba file output qua AtomicWriter (Req 15.3 atomic write).
 *
 * Pipeline:
 *   1. Render `delta-report.md` từ `deltas`.
 *   2. Render `conflict-log.md` từ `decisions`.
 *   3. Render `parity-sync-report.md` từ `runResult`.
 *   4. Cho mỗi file, gọi `assertNoEmojiNoPII` trước khi ghi (Property 11
 *      final check, task 12.4).
 *   5. Ghi atomic vào `<workspaceRoot>/<outputDir>/<filename>`.
 *
 * Defaults:
 *   - `outputDir`: `'docs/audits/upstream-parity'` (design.md > Định
 *     vị tool trong repo).
 *   - `workspaceRoot`: `process.cwd()`.
 *
 * Lỗi:
 *   - `assertNoEmojiNoPII` throw → propagate, KHÔNG ghi file đó. Các file
 *     khác đã ghi xong vẫn giữ trên đĩa (best-effort partial completion;
 *     caller nên rerun sau khi fix root cause).
 *   - AtomicWriter throw `E_WRITE_LOCK` → propagate; reports đã ghi xong
 *     trước đó vẫn giữ.
 *
 * @param {object} args
 * @param {DeltaEntry[]} args.deltas
 * @param {ConflictDecision[]} args.decisions
 * @param {ParityRunResult} args.runResult
 * @param {string} [args.outputDir]      POSIX-style relative tới
 *                                       `workspaceRoot`. Default
 *                                       `'docs/audits/upstream-parity'`.
 * @param {string} [args.workspaceRoot]  OS-native absolute. Default
 *                                       `process.cwd()`.
 * @returns {{
 *   delta:    { path: string, bytes: number },
 *   conflict: { path: string, bytes: number },
 *   run:      { path: string, bytes: number }
 * }}
 */
function writeReports(args) {
  if (!args || typeof args !== 'object') {
    throw new TypeError('writeReports: args phải là object.');
  }
  const { deltas, decisions, runResult } = args;

  const outputDir = typeof args.outputDir === 'string' && args.outputDir !== ''
    ? args.outputDir
    : DEFAULT_OUTPUT_DIR;
  const workspaceRoot = typeof args.workspaceRoot === 'string' && args.workspaceRoot !== ''
    ? args.workspaceRoot
    : process.cwd();

  // Render all three before writing — fail-fast nếu render throw, KHÔNG
  // ghi gì lên đĩa.
  const deltaContent = renderDeltaReport(deltas);
  const conflictContent = renderConflictLog(decisions);
  const runContent = renderParitySyncReport(runResult);

  // Property 11 final check (task 12.4) — assert TRƯỚC ghi, fail-fast.
  assertNoEmojiNoPII(deltaContent, { label: REPORT_FILENAMES.delta });
  assertNoEmojiNoPII(conflictContent, { label: REPORT_FILENAMES.conflict });
  assertNoEmojiNoPII(runContent, { label: REPORT_FILENAMES.run });

  const deltaPath = path.join(workspaceRoot, outputDir, REPORT_FILENAMES.delta);
  const conflictPath = path.join(workspaceRoot, outputDir, REPORT_FILENAMES.conflict);
  const runPath = path.join(workspaceRoot, outputDir, REPORT_FILENAMES.run);

  atomicWriter.writeAtomic(deltaPath, deltaContent);
  atomicWriter.writeAtomic(conflictPath, conflictContent);
  atomicWriter.writeAtomic(runPath, runContent);

  return {
    delta: { path: deltaPath, bytes: Buffer.byteLength(deltaContent, 'utf8') },
    conflict: { path: conflictPath, bytes: Buffer.byteLength(conflictContent, 'utf8') },
    run: { path: runPath, bytes: Buffer.byteLength(runContent, 'utf8') },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Public surface (task 12.1–12.4).
  renderDeltaReport,
  renderConflictLog,
  renderParitySyncReport,
  assertNoEmojiNoPII,
  writeReports,
  // Exposed cho tests + introspection.
  STATUS_HEADERS,
  PRESET_ORDER,
  LOGGABLE_DECISIONS,
  MANUAL_REVIEW_TOP_N,
  REPORT_FILENAMES,
  DEFAULT_OUTPUT_DIR,
  EMOJI_RE,
  EMAIL_RE,
  PHONE_E164_RE,
  // Helpers (testable units).
  compareDeltaEntries,
  compareDecisionsByTarget,
  formatPartialReason,
  formatDetailLine,
  stripPresetsPrefix,
  buildFrontMatter,
};
