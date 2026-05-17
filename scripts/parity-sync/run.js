/**
 * ClaudeKit Parity Sync — CLI entry point.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 5 / 13.1–13.7 — wire full pipeline end-to-end.
 *
 *   13.1 Pipeline tuần tự: InventoryReader -> DeltaDetector -> CategoryMapper
 *        -> PortPlanner.
 *   13.2 --dry-run (default): chỉ emit delta-report.md, KHÔNG ghi presets/
 *        và KHÔNG đụng manifest.
 *   13.3 --apply: chạy thêm Porter -> ManifestUpdater -> Reporter (3 files).
 *   13.4 --preset <name>: filter chỉ một preset (apply ở post-PortPlanner).
 *   13.5 Final structural check (Property 8): assert MIN_AGENTS=16,
 *        MIN_SKILLS=28, MIN_COMMANDS=40, MIN_HOOKS=6, MIN_WORKFLOWS=4.
 *        Chỉ chạy ở --apply (dry-run không có future state để enforce).
 *   13.6 Final rebrand-leak check (Property 4): scan presets/<P>/ cho
 *        pattern `Claude Code` | `ClaudeKit` | `.claude/` (loại trừ
 *        `skills/claude-code/`). Chỉ chạy ở --apply.
 *   13.7 PBT Property 10 (Idempotency) — file riêng:
 *        `__tests__/property/p10-idempotency.test.js`.
 *
 * Maintainer-time tool (KHÔNG phải runtime feature của `kiro-kit` CLI).
 *
 * Pipeline đầy đủ:
 *
 *   InventoryReader -> DeltaDetector -> CategoryMapper -> PortPlanner
 *     -> [dry-run]  emit delta-report.md only
 *     -> [apply]    Porter (Rebrander + ConflictResolver + AtomicWriter)
 *                   -> ManifestUpdater (per preset) -> Reporter (3 files)
 *                   -> threshold check -> rebrand-leak check
 *
 * Usage:
 *
 *   node scripts/parity-sync/run.js [--dry-run] [--apply] [--preset <name>]
 *                                   [--help]
 *
 * Mặc định = dry-run (Req 15.4 dry-run safety net). `--apply` chuyển sang
 * chế độ ghi thật.
 *
 * Exit codes (design.md > Error Handling):
 *   0  success
 *   2  inventory / arg error (E_INV_MISSING, E_INV_SCHEMA, bad --preset)
 *   3  atomic write fail (E_WRITE_LOCK)
 *   4  manifest invalid / orphan (E_MANIFEST_INVALID / E_MANIFEST_NO_ORPHAN)
 *   5  threshold fail (E_THRESHOLD_FAIL)
 *   6  rebrand leak (E_REBRAND_LEAK)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const inventoryReader = require('./inventory-reader');
const deltaDetector = require('./delta-detector');
const categoryMapper = require('./category-mapper');
const portPlanner = require('./port-planner');
const porter = require('./porter');
const manifestUpdater = require('./manifest-updater');
const reporter = require('./reporter');
const atomicWriter = require('./atomic-writer');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PRESETS = Object.freeze([
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'devops',
  'data-ai',
  '_template',
]);

/**
 * Preset chính cần threshold check (loại `_template` — skeleton internal).
 *
 * @type {ReadonlyArray<string>}
 */
const MAIN_PRESETS = Object.freeze(
  VALID_PRESETS.filter((p) => p !== '_template'),
);

const EXIT_OK = 0;
const EXIT_ARG_OR_INVENTORY = 2;
const EXIT_WRITE_LOCK = 3;
const EXIT_MANIFEST_INVALID = 4;
const EXIT_THRESHOLD_FAIL = 5;
const EXIT_REBRAND_LEAK = 6;

const STAGE_CLI = 'CLI';
const STAGE_INV = 'INVENTORY';
const STAGE_DETECT = 'DETECT';
const STAGE_CATEGORY = 'CATEGORY';
const STAGE_PLAN = 'PLAN';
const STAGE_PORT = 'PORT';
const STAGE_MANIFEST = 'MANIFEST';
const STAGE_REPORT = 'REPORT';
const STAGE_CHECK = 'CHECK';

/**
 * Default appendix directory (POSIX-style relative to workspace root).
 */
const DEFAULT_APPENDIX_DIR = 'docs/audits/claudekit-vs-kirokit/appendix';

/**
 * Default source root: `claudekit-engineer-main/.claude/`. Porter joins
 * `plan.source_path` (đã strip prefix qua DeltaDetector) với root này.
 */
const DEFAULT_SOURCE_ROOT = 'claudekit-engineer-main/.claude';

/**
 * Default output directory cho 3 file report (relative to workspace root).
 */
const DEFAULT_OUTPUT_DIR = 'docs/audits/claudekit-vs-kirokit';

/**
 * Threshold tối thiểu per preset (Property 8, Req 14.1–14.5).
 * Apply check sau khi `--apply` xong cho mọi preset đã có port.
 *
 * @type {Readonly<Record<string, number>>}
 */
const THRESHOLDS = Object.freeze({
  agents: 16,
  skills: 28,
  commands: 40,
  hooks: 6,
  workflows: 4,
});

/**
 * Subdirs trong `presets/<P>/` được đếm cho threshold + before/after.
 *
 * - `agents`:    đếm file `.md` trực tiếp.
 * - `skills`:    đếm thư mục con (mỗi skill = 1 folder), không đếm sub-files.
 * - `commands`:  đếm file `.md` đệ quy (subdirs `git/`, `fix/`, ... được đếm).
 * - `hooks`:     đếm tri-script group qua basename của file `.js` ở thư mục
 *                trực tiếp (`<name>.js` → 1 group). README.md, .env.example
 *                không tính.
 * - `workflows`: đếm file `.md` trực tiếp.
 *
 * @type {ReadonlyArray<string>}
 */
const COUNTABLE_DIRS = Object.freeze([
  'agents',
  'skills',
  'commands',
  'hooks',
  'workflows',
]);

/**
 * Extensions được scan trong rebrand-leak check. Khớp với design Rebrand Rule
 * scope: `.md`, `.json`, `.js`, `.sh`, `.ps1`, `.py`. Thêm `.txt` để defensive
 * cho documentation files.
 *
 * @type {ReadonlySet<string>}
 */
const REBRAND_SCAN_EXTS = Object.freeze(
  new Set(['.md', '.json', '.js', '.sh', '.ps1', '.py', '.txt']),
);

/**
 * Pattern phát hiện rebrand leak (Property 4 / Req 11). Loại trừ:
 *   - Path nằm trong `skills/claude-code/` (read-only docs về Claude Code
 *     product, Req 11.1 exception).
 *   - URL `https://docs.claude.com/...` (giữ nguyên, Req 11.4) — KHÔNG
 *     match pattern `.claude/` vì URL có scheme `https://` ở trước.
 *
 * Pattern là alternation đơn giản:
 *   - `Claude Code` (whitespace nguyên văn)
 *   - `ClaudeKit`
 *   - `.claude/` (đường dẫn workspace cũ)
 *
 * @type {RegExp}
 */
const REBRAND_LEAK_RE = /Claude Code|ClaudeKit|\.claude\//;

// ---------------------------------------------------------------------------
// Logger (stderr only — Req 15.2: KHÔNG ghi log/timestamp vào file artifact)
// Format: [YYYY-MM-DDTHH:mm:ssZ] [STAGE] [LEVEL] message
// ---------------------------------------------------------------------------

function nowIsoSeconds() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function log(stage, level, message) {
  const line = `[${nowIsoSeconds()}] [${stage}] [${level}] ${message}\n`;
  process.stderr.write(line);
}

const logger = {
  info: (stage, msg) => log(stage, 'INFO', msg),
  warn: (stage, msg) => log(stage, 'WARN', msg),
  error: (stage, msg) => log(stage, 'ERROR', msg),
};

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage() {
  const lines = [
    'ClaudeKit Parity Sync — port content từ claudekit-engineer-main vào presets/',
    '',
    'Usage:',
    '  node scripts/parity-sync/run.js [options]',
    '',
    'Options:',
    '  --dry-run            Chỉ sinh delta-report (mặc định, không ghi đĩa).',
    '  --apply              Chạy port + manifest update + reporter (ghi đĩa).',
    '  --preset <name>      Chỉ xử lý 1 preset. Hợp lệ:',
    `                       ${VALID_PRESETS.join(', ')}`,
    '  -h, --help           In hướng dẫn này.',
    '',
    'Exit codes:',
    '  0 success | 2 arg/inventory error | 3 atomic-write fail |',
    '  4 manifest invalid/orphan | 5 threshold fail | 6 rebrand leak',
    '',
    'Spec: .kiro/specs/claudekit-parity-sync/design.md',
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Arg parser
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ParsedArgs
 * @property {boolean} dryRun
 * @property {boolean} apply
 * @property {string|null} preset
 * @property {string|null} sourceRoot
 * @property {boolean} help
 */

/**
 * @param {string[]} argv
 * @returns {ParsedArgs}
 */
function parseArgs(argv) {
  /** @type {ParsedArgs} */
  const out = {
    dryRun: true,
    apply: false,
    preset: null,
    sourceRoot: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    switch (token) {
      case '-h':
      case '--help':
        out.help = true;
        break;

      case '--dry-run':
        out.dryRun = true;
        break;

      case '--apply':
        out.apply = true;
        break;

      case '--preset': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw makeArgError('--preset cần một tên preset đi kèm.');
        }
        out.preset = value;
        i += 1;
        break;
      }

      case '--source-root': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw makeArgError('--source-root cần một đường dẫn đi kèm.');
        }
        out.sourceRoot = value;
        i += 1;
        break;
      }

      default:
        if (token.startsWith('--preset=')) {
          out.preset = token.slice('--preset='.length);
          break;
        }
        if (token.startsWith('--source-root=')) {
          out.sourceRoot = token.slice('--source-root='.length);
          break;
        }
        throw makeArgError(`Cờ không nhận diện được: ${token}`);
    }
  }

  if (out.apply) {
    out.dryRun = false;
  }

  if (!out.help && out.preset !== null && !VALID_PRESETS.includes(out.preset)) {
    throw makeArgError(
      `Preset không hợp lệ: "${out.preset}". Hợp lệ: ${VALID_PRESETS.join(', ')}.`,
    );
  }

  return out;
}

function makeArgError(message) {
  const err = new Error(message);
  err.exitCode = EXIT_ARG_OR_INVENTORY;
  err.isArgError = true;
  return err;
}

// ---------------------------------------------------------------------------
// Filesystem helpers (count, scan)
// ---------------------------------------------------------------------------

/**
 * Đếm file `.md` trực tiếp trong một thư mục (1-level, không đệ quy).
 *
 * @param {string} dirAbs Absolute OS path.
 * @returns {number}
 */
function countMdFlat(dirAbs) {
  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return 0;
    throw err;
  }
  let count = 0;
  for (const ent of entries) {
    if (ent.isFile() && ent.name.endsWith('.md')) count += 1;
  }
  return count;
}

/**
 * Đếm số thư mục con trực tiếp (1-level). Mỗi skill = 1 folder.
 *
 * @param {string} dirAbs
 * @returns {number}
 */
function countDirsFlat(dirAbs) {
  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return 0;
    throw err;
  }
  let count = 0;
  for (const ent of entries) {
    if (ent.isDirectory()) count += 1;
  }
  return count;
}

/**
 * Đếm file `.md` đệ quy (cho commands/ với subdirs `git/`, `fix/`, ...).
 *
 * @param {string} dirAbs
 * @returns {number}
 */
function countMdRecursive(dirAbs) {
  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return 0;
    throw err;
  }
  let count = 0;
  for (const ent of entries) {
    if (ent.name === 'node_modules') continue;
    const childAbs = path.join(dirAbs, ent.name);
    if (ent.isDirectory()) {
      count += countMdRecursive(childAbs);
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      count += 1;
    }
  }
  return count;
}

/**
 * Đếm hook tri-script groups: mỗi `<name>.js` ở `presets/<P>/hooks/` (1-level)
 * đếm là 1 group. Loại README.md, .env.example, *.md docs, *.sh/.ps1 không có
 * `.js` đối tác (defensive).
 *
 * @param {string} dirAbs
 * @returns {number}
 */
function countHookGroups(dirAbs) {
  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return 0;
    throw err;
  }
  let count = 0;
  for (const ent of entries) {
    if (ent.isFile() && ent.name.endsWith('.js')) count += 1;
  }
  return count;
}

/**
 * Build per-preset count snapshot cho threshold check + before/after.
 *
 * Counts:
 *   agents    = #(.md files trực tiếp trong agents/)
 *   skills    = #(thư mục con trực tiếp trong skills/)
 *   commands  = #(.md files đệ quy trong commands/)
 *   hooks     = #(.js files trực tiếp trong hooks/) — tri-script groups
 *   workflows = #(.md files trực tiếp trong workflows/)
 *
 * @param {string} preset
 * @param {string} workspaceRoot Absolute OS path tới workspace root.
 * @returns {{agents: number, skills: number, commands: number, hooks: number, workflows: number}}
 */
function countPresetArtifacts(preset, workspaceRoot) {
  const presetDir = path.join(workspaceRoot, 'presets', preset);
  return {
    agents: countMdFlat(path.join(presetDir, 'agents')),
    skills: countDirsFlat(path.join(presetDir, 'skills')),
    commands: countMdRecursive(path.join(presetDir, 'commands')),
    hooks: countHookGroups(path.join(presetDir, 'hooks')),
    workflows: countMdFlat(path.join(presetDir, 'workflows')),
  };
}

/**
 * Walk `presets/<P>/` đệ quy, return mảng POSIX-style relative paths của
 * mọi file. Skip `node_modules/`, follow nothing (no symlinks).
 *
 * @param {string} presetDir Absolute OS path.
 * @param {string} [base] Internal accumulator (POSIX).
 * @returns {string[]}
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
    if (err && err.code === 'ENOENT') return result;
    throw err;
  }

  for (const ent of entries) {
    if (ent.name === 'node_modules') continue;
    const childAbs = path.join(presetDir, ent.name);
    const relPath = baseStr === '' ? ent.name : `${baseStr}/${ent.name}`;
    if (ent.isDirectory()) {
      result.push(...walkPresetFiles(childAbs, relPath));
    } else if (ent.isFile()) {
      result.push(relPath);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Final checks (task 13.5, 13.6)
// ---------------------------------------------------------------------------

/**
 * Threshold check (Property 8): mọi preset đã `--apply` phải đạt
 * `MIN_AGENTS=16, MIN_SKILLS=28, MIN_COMMANDS=40, MIN_HOOKS=6,
 * MIN_WORKFLOWS=4`.
 *
 * Throw Error với `code === 'E_THRESHOLD_FAIL'` và `details: Array<{preset, gaps}>`
 * khi có vi phạm. Caller map sang exit code 5.
 *
 * @param {object} args
 * @param {string[]} args.presets   Tập preset đã apply.
 * @param {string} args.workspaceRoot
 * @returns {{ presets: string[], counts: Record<string, object> }}
 *          Trả về stats khi pass (cho logger).
 * @throws {Error} `code === 'E_THRESHOLD_FAIL'` khi fail.
 */
function checkThresholds(args) {
  /** @type {Record<string, object>} */
  const counts = {};
  /** @type {Array<{preset: string, gaps: Record<string, {min: number, actual: number}>}>} */
  const failures = [];

  for (const preset of args.presets) {
    const c = countPresetArtifacts(preset, args.workspaceRoot);
    counts[preset] = c;
    /** @type {Record<string, {min: number, actual: number}>} */
    const gaps = {};
    for (const key of COUNTABLE_DIRS) {
      const min = THRESHOLDS[key];
      const actual = c[key];
      if (actual < min) {
        gaps[key] = { min, actual };
      }
    }
    if (Object.keys(gaps).length > 0) {
      failures.push({ preset, gaps });
    }
  }

  if (failures.length > 0) {
    /** @type {string[]} */
    const lines = [];
    lines.push('Threshold check failed (Property 8):');
    for (const f of failures) {
      const parts = [];
      for (const key of COUNTABLE_DIRS) {
        if (f.gaps[key]) {
          parts.push(`${key}=${f.gaps[key].actual}/${f.gaps[key].min}`);
        }
      }
      lines.push(`  - ${f.preset}: ${parts.join(', ')}`);
    }
    const err = new Error(lines.join('\n'));
    err.code = 'E_THRESHOLD_FAIL';
    err.details = failures;
    err.exitCode = EXIT_THRESHOLD_FAIL;
    throw err;
  }

  return { presets: args.presets.slice(), counts };
}

/**
 * Rebrand-leak check (Property 4): scan presets/<P>/ sau apply, fail nếu còn
 * pattern `Claude Code` | `ClaudeKit` | `.claude/` ngoài exception.
 *
 * Exception (Req 11.1):
 *   - File nằm trong `skills/claude-code/` (read-only docs về Claude Code
 *     product) — KHÔNG phải vi phạm.
 *
 * Throw Error với `code === 'E_REBRAND_LEAK'` và `details: Array<{file,
 * line, lineNumber, match}>`. Caller map sang exit code 6.
 *
 * Implementation note: dùng simple scan line-by-line, KHÔNG parse markdown.
 * URL `https://docs.claude.com/...` được giữ nguyên (Req 11.4) — KHÔNG
 * match pattern `.claude/` vì path component khác. Pattern alternation
 * không match URL.
 *
 * @param {object} args
 * @param {string[]} args.presets
 * @param {string} args.workspaceRoot
 * @returns {{ presets: string[], filesScanned: number }}
 * @throws {Error} `code === 'E_REBRAND_LEAK'` khi fail.
 */
function checkRebrandLeak(args) {
  /** @type {Array<{preset: string, file: string, lineNumber: number, line: string, match: string}>} */
  const leaks = [];
  let filesScanned = 0;

  for (const preset of args.presets) {
    const presetDir = path.join(args.workspaceRoot, 'presets', preset);
    const files = walkPresetFiles(presetDir);

    for (const rel of files) {
      // Exception: skills/claude-code/ subtree.
      if (rel.startsWith('skills/claude-code/') || rel === 'skills/claude-code') {
        continue;
      }
      const ext = path.extname(rel).toLowerCase();
      if (!REBRAND_SCAN_EXTS.has(ext)) continue;

      filesScanned += 1;

      const filePath = path.join(presetDir, rel);
      /** @type {string} */
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        if (err && err.code === 'ENOENT') continue;
        throw err;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const m = REBRAND_LEAK_RE.exec(lines[i]);
        if (m) {
          leaks.push({
            preset,
            file: `presets/${preset}/${rel}`,
            lineNumber: i + 1,
            line: lines[i],
            match: m[0],
          });
        }
      }
    }
  }

  if (leaks.length > 0) {
    /** @type {string[]} */
    const lines = [];
    lines.push(`Rebrand-leak check failed (Property 4): ${leaks.length} match(es).`);
    // Hiển thị tối đa 10 leak đầu để giữ stderr gọn.
    for (let i = 0; i < Math.min(10, leaks.length); i += 1) {
      const l = leaks[i];
      lines.push(`  - ${l.file}:${l.lineNumber} matched "${l.match}"`);
    }
    if (leaks.length > 10) {
      lines.push(`  ... and ${leaks.length - 10} more`);
    }
    const err = new Error(lines.join('\n'));
    err.code = 'E_REBRAND_LEAK';
    err.details = leaks;
    err.exitCode = EXIT_REBRAND_LEAK;
    throw err;
  }

  return { presets: args.presets.slice(), filesScanned };
}

// ---------------------------------------------------------------------------
// Pipeline (testable, side-effect controlled via options)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} PipelineOptions
 * @property {boolean} apply               True = apply mode, false = dry-run.
 * @property {string|null} preset          Filter; null = mọi preset.
 * @property {string} [workspaceRoot]      Absolute OS path. Default cwd.
 * @property {string} [appendixDir]        POSIX relative đến workspace root
 *                                         hoặc absolute. Default
 *                                         `docs/audits/claudekit-vs-kirokit/appendix`.
 * @property {string} [sourceRoot]         Absolute OS path tới `.claude/` của
 *                                         source kit. Default
 *                                         `<workspaceRoot>/claudekit-engineer-main/.claude`.
 * @property {string} [outputDir]          POSIX relative đến workspace root
 *                                         hoặc absolute. Default
 *                                         `docs/audits/claudekit-vs-kirokit`.
 * @property {boolean} [skipFinalChecks]   Skip threshold + leak check (test
 *                                         harness only). Mặc định false.
 * @property {string} [ranAt]              ISO 8601 timestamp override cho
 *                                         determinism trong tests. Mặc định
 *                                         `nowIsoSeconds()`.
 *
 * @typedef {object} PipelineResult
 * @property {object[]} deltas             DeltaEntry[] sau CategoryMapper.
 * @property {object[]} plans              PortPlan[] sau filter --preset.
 * @property {object[]} ported             PortedFile[] (apply mode).
 * @property {object[]} skipped            SkippedFile[] (apply mode).
 * @property {object[]} decisions          ConflictDecision[] (apply mode).
 * @property {string[]} warnings           Pipeline warnings.
 * @property {string[]} touchedPresets     Preset đã port (cho final checks).
 * @property {object} runResult            ParityRunResult (apply mode).
 * @property {object} reportPaths          Paths của file đã ghi.
 */

/**
 * Resolve một path tuỳ chọn (POSIX-relative hoặc absolute) sang absolute
 * OS path tương đối với `workspaceRoot`.
 *
 * @param {string} value
 * @param {string} workspaceRoot
 * @returns {string}
 */
function resolveWorkspacePath(value, workspaceRoot) {
  if (path.isAbsolute(value)) return value;
  return path.join(workspaceRoot, value);
}

/**
 * Run full pipeline. Pure function của options (không gọi `process.exit`,
 * không parse argv). Caller (`main`) wrap với try/catch + exit code mapping.
 *
 * @param {PipelineOptions} opts
 * @returns {PipelineResult}
 */
function runPipeline(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('runPipeline: opts phải là object.');
  }

  const workspaceRoot = typeof opts.workspaceRoot === 'string' && opts.workspaceRoot !== ''
    ? opts.workspaceRoot
    : process.cwd();
  const appendixDir = typeof opts.appendixDir === 'string' && opts.appendixDir !== ''
    ? resolveWorkspacePath(opts.appendixDir, workspaceRoot)
    : path.join(workspaceRoot, DEFAULT_APPENDIX_DIR);
  const sourceRoot = typeof opts.sourceRoot === 'string' && opts.sourceRoot !== ''
    ? opts.sourceRoot
    : path.join(workspaceRoot, DEFAULT_SOURCE_ROOT);
  // Keep outputDir as POSIX-relative-to-workspaceRoot. Reporter.writeReports
  // joins workspaceRoot + outputDir + filename internally; passing an
  // absolute outputDir on Windows would yield a doubled path
  // (`C:\ws\C:\ws\docs\...`) because path.join doesn't collapse absolutes.
  const outputDir = typeof opts.outputDir === 'string' && opts.outputDir !== ''
    ? opts.outputDir
    : DEFAULT_OUTPUT_DIR;
  const outputDirAbs = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(workspaceRoot, outputDir);
  const ranAt = typeof opts.ranAt === 'string' && opts.ranAt !== ''
    ? opts.ranAt
    : nowIsoSeconds();
  const skipFinalChecks = Boolean(opts.skipFinalChecks);

  // -------------------------------------------------------------------------
  // 13.1: Read inventory.
  // -------------------------------------------------------------------------
  logger.info(STAGE_INV, `Đọc inventory tại ${appendixDir}`);
  const { source, target } = inventoryReader.readAll(appendixDir);
  logger.info(
    STAGE_INV,
    `Source: ${source.items.length} items; Target: ${
      Object.keys(target.byPreset).map(
        (p) => `${p}=${target.byPreset[p].length}`,
      ).join(' ')
    }`,
  );

  // -------------------------------------------------------------------------
  // 13.1: Detect deltas.
  // -------------------------------------------------------------------------
  const rawDeltas = deltaDetector.detect(source, target);
  logger.info(STAGE_DETECT, `Sinh ${rawDeltas.length} DeltaEntry (raw).`);

  // -------------------------------------------------------------------------
  // 13.1: Apply category rules.
  // -------------------------------------------------------------------------
  const deltas = categoryMapper.apply(rawDeltas, source.items);
  /** @type {Record<string, number>} */
  const statusCounts = { present: 0, missing: 0, partial: 0, 'category-skip': 0 };
  for (const d of deltas) {
    if (d && Object.prototype.hasOwnProperty.call(statusCounts, d.status)) {
      statusCounts[d.status] += 1;
    }
  }
  logger.info(
    STAGE_CATEGORY,
    `Status counts: present=${statusCounts.present} missing=${statusCounts.missing} partial=${statusCounts.partial} category-skip=${statusCounts['category-skip']}`,
  );

  // -------------------------------------------------------------------------
  // 13.1: Build port plans.
  // -------------------------------------------------------------------------
  let plans = portPlanner.plan(deltas, source.items);
  logger.info(STAGE_PLAN, `Sinh ${plans.length} PortPlan (pre-filter).`);

  // -------------------------------------------------------------------------
  // 13.4: Filter --preset (chạy ở post-PortPlanner, không đụng deltas).
  // -------------------------------------------------------------------------
  if (opts.preset) {
    const before = plans.length;
    plans = plans.filter((p) => p && p.target_preset === opts.preset);
    logger.info(
      STAGE_PLAN,
      `Filter preset="${opts.preset}": ${before} -> ${plans.length} plans.`,
    );
  }

  // -------------------------------------------------------------------------
  // 13.2: Dry-run mode — emit chỉ delta-report.md, return early.
  // -------------------------------------------------------------------------
  if (!opts.apply) {
    logger.info(STAGE_REPORT, 'Dry-run: chỉ render delta-report.md, không ghi presets/.');
    const deltaContent = reporter.renderDeltaReport(deltas);
    reporter.assertNoEmojiNoPII(deltaContent, { label: 'delta-report.md' });
    const deltaPath = path.join(outputDirAbs, 'delta-report.md');
    atomicWriter.writeAtomic(deltaPath, deltaContent);
    logger.info(STAGE_REPORT, `Wrote ${deltaPath} (${Buffer.byteLength(deltaContent, 'utf8')} bytes).`);

    return {
      deltas,
      plans,
      ported: [],
      skipped: [],
      decisions: [],
      warnings: [],
      touchedPresets: [],
      runResult: null,
      reportPaths: { delta: deltaPath, conflict: null, run: null },
    };
  }

  // -------------------------------------------------------------------------
  // 13.3: Apply mode — Porter execution.
  // -------------------------------------------------------------------------
  // Snapshot before counts cho mọi preset main (để parity-sync-report).
  /** @type {Record<string, {agents: number, skills: number, commands: number, hooks: number, workflows: number}>} */
  const beforeCounts = {};
  for (const preset of MAIN_PRESETS) {
    beforeCounts[preset] = countPresetArtifacts(preset, workspaceRoot);
  }

  logger.info(STAGE_PORT, `Apply mode: chạy Porter cho ${plans.length} plans.`);
  const portResult = porter.port(plans, {
    sourceRoot,
    targetRoot: workspaceRoot,
    dryRun: false,
    sessionState: { resolvedSidecars: new Set() },
  });
  logger.info(
    STAGE_PORT,
    `Porter: ported=${portResult.ported.length} skipped=${portResult.skipped.length} decisions=${portResult.decisions.length} warnings=${portResult.warnings.length}`,
  );

  // Group ported files by preset cho ManifestUpdater.
  /** @type {Record<string, object[]>} */
  const portedByPreset = {};
  for (const pf of portResult.ported) {
    if (!pf || typeof pf !== 'object') continue;
    const p = pf.target_preset;
    if (!p) continue;
    if (!portedByPreset[p]) portedByPreset[p] = [];
    portedByPreset[p].push(pf);
  }

  // -------------------------------------------------------------------------
  // 13.3: Manifest update per preset (atomic transaction with rollback).
  // -------------------------------------------------------------------------
  const touchedPresets = Object.keys(portedByPreset).sort();
  logger.info(
    STAGE_MANIFEST,
    `Updating manifest cho ${touchedPresets.length} preset(s): ${touchedPresets.join(', ') || '(none)'}`,
  );

  for (const preset of touchedPresets) {
    const portedFiles = portedByPreset[preset];
    const updateResult = manifestUpdater.update(preset, portedFiles, { workspaceRoot });

    try {
      manifestUpdater.validateOrThrow(updateResult.manifest, {
        preset,
        workspaceRoot,
        portedFiles,
      });
    } catch (err) {
      // Rollback: xoá file đã port cho preset này.
      logger.error(
        STAGE_MANIFEST,
        `Validation failed cho preset "${preset}": ${err.code} — rolling back ${portedFiles.length} file(s).`,
      );
      const rollbackStats = manifestUpdater.rollbackPortedFiles(portedFiles, {
        workspaceRoot,
      });
      logger.warn(
        STAGE_MANIFEST,
        `Rollback stats cho "${preset}": deleted=${rollbackStats.deleted} missing=${rollbackStats.missing} errors=${rollbackStats.errors.length}`,
      );
      throw err;
    }

    manifestUpdater.commit(updateResult);
    logger.info(
      STAGE_MANIFEST,
      `Committed manifest cho "${preset}": ${updateResult.appended.length} appended, ${updateResult.skipped.length} skipped.`,
    );
  }

  // -------------------------------------------------------------------------
  // 13.3: Reporter — emit cả 3 file output.
  // -------------------------------------------------------------------------
  // Snapshot after counts.
  /** @type {Record<string, {agents: number, skills: number, commands: number, hooks: number, workflows: number}>} */
  const afterCounts = {};
  for (const preset of MAIN_PRESETS) {
    afterCounts[preset] = countPresetArtifacts(preset, workspaceRoot);
  }

  /** @type {Record<string, {before: object, after: object}>} */
  const perPreset = {};
  for (const preset of MAIN_PRESETS) {
    perPreset[preset] = { before: beforeCounts[preset], after: afterCounts[preset] };
  }

  // Sidecar paths cho manualReview (decision === 'sidecar').
  const manualReview = portResult.decisions
    .filter((d) => d && d.decision === 'sidecar' && typeof d.sidecar_path === 'string')
    .map((d) => d.sidecar_path)
    .sort();

  // Conflict count (loggable: write-new + kept-target + merged-frontmatter +
  // sidecar + json-merged) — khớp với reporter.LOGGABLE_DECISIONS.
  const conflicts = portResult.decisions.filter(
    (d) => d && d.decision !== 'no-op',
  ).length;

  /** @type {object} */
  const runResult = {
    ranAt,
    presets: touchedPresets,
    totals: {
      ported: portResult.ported.length,
      skipped: portResult.skipped.length,
      conflicts,
      manualReviewPending: manualReview.length,
    },
    perPreset,
    manualReview,
  };

  logger.info(STAGE_REPORT, 'Render + write 3 reports (delta, conflict, parity-sync).');
  const reportPaths = reporter.writeReports({
    deltas,
    decisions: portResult.decisions,
    runResult,
    outputDir,
    workspaceRoot,
  });
  logger.info(
    STAGE_REPORT,
    `Wrote: delta=${reportPaths.delta.bytes}B conflict=${reportPaths.conflict.bytes}B run=${reportPaths.run.bytes}B`,
  );

  // -------------------------------------------------------------------------
  // 13.5: Final structural check (Property 8).
  // -------------------------------------------------------------------------
  if (!skipFinalChecks && touchedPresets.length > 0) {
    // Threshold check chỉ áp cho preset main đã port (loại _template).
    const presetsToCheck = touchedPresets.filter((p) => p !== '_template');
    if (presetsToCheck.length > 0) {
      logger.info(STAGE_CHECK, `Threshold check cho ${presetsToCheck.length} preset(s).`);
      checkThresholds({ presets: presetsToCheck, workspaceRoot });
      logger.info(STAGE_CHECK, 'Threshold check passed.');

      // -------------------------------------------------------------------
      // 13.6: Final rebrand-leak check (Property 4).
      // -------------------------------------------------------------------
      logger.info(STAGE_CHECK, `Rebrand-leak scan cho ${presetsToCheck.length} preset(s).`);
      const leakStats = checkRebrandLeak({ presets: presetsToCheck, workspaceRoot });
      logger.info(
        STAGE_CHECK,
        `Rebrand-leak check passed: ${leakStats.filesScanned} file(s) scanned.`,
      );
    }
  }

  return {
    deltas,
    plans,
    ported: portResult.ported,
    skipped: portResult.skipped,
    decisions: portResult.decisions,
    warnings: portResult.warnings,
    touchedPresets,
    runResult,
    reportPaths: {
      delta: reportPaths.delta.path,
      conflict: reportPaths.conflict.path,
      run: reportPaths.run.path,
    },
  };
}

// ---------------------------------------------------------------------------
// Error → exit code mapping
// ---------------------------------------------------------------------------

/**
 * Map lỗi runtime sang exit code theo design.md > Error Handling.
 *
 * @param {unknown} err
 * @returns {number}
 */
function exitCodeForError(err) {
  if (!err || typeof err !== 'object') return EXIT_ARG_OR_INVENTORY;
  const code = /** @type {{code?: string, exitCode?: number}} */ (err).code;
  const exitCode = /** @type {{exitCode?: number}} */ (err).exitCode;
  if (typeof exitCode === 'number') return exitCode;
  switch (code) {
    case 'E_INV_MISSING':
    case 'E_INV_SCHEMA':
      return EXIT_ARG_OR_INVENTORY;
    case 'E_WRITE_LOCK':
      return EXIT_WRITE_LOCK;
    case 'E_MANIFEST_INVALID':
    case 'E_MANIFEST_NO_ORPHAN':
    case 'E_MANIFEST_BROKEN_LINK':
    case 'E_MANIFEST_ORPHAN':
      return EXIT_MANIFEST_INVALID;
    case 'E_THRESHOLD_FAIL':
      return EXIT_THRESHOLD_FAIL;
    case 'E_REBRAND_LEAK':
      return EXIT_REBRAND_LEAK;
    default:
      return EXIT_ARG_OR_INVENTORY;
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    logger.error(STAGE_CLI, err.message);
    process.stderr.write('\nChạy với --help để xem cách dùng.\n');
    return EXIT_ARG_OR_INVENTORY;
  }

  if (args.help) {
    printUsage();
    return EXIT_OK;
  }

  logger.info(
    STAGE_CLI,
    `Mode=${args.apply ? 'apply' : 'dry-run'} preset=${args.preset ?? 'all'}`,
  );

  if (!args.apply) {
    logger.warn(
      STAGE_CLI,
      'Đang chạy ở chế độ DRY-RUN. Truyền --apply để ghi vào presets/.',
    );
  }

  try {
    runPipeline({
      apply: args.apply,
      preset: args.preset,
      sourceRoot: args.sourceRoot || undefined,
    });
    logger.info(STAGE_CLI, 'Done.');
    return EXIT_OK;
  } catch (err) {
    const code = exitCodeForError(err);
    logger.error(
      STAGE_CLI,
      `Pipeline failed (code=${err && err.code ? err.code : 'unknown'}, exit=${code}): ${err && err.message ? err.message : String(err)}`,
    );
    if (err && err.stack) {
      process.stderr.write(err.stack + '\n');
    }
    return code;
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      logger.error(STAGE_CLI, `Uncaught: ${err && err.message ? err.message : err}`);
      if (err && err.stack) {
        process.stderr.write(err.stack + '\n');
      }
      process.exit(exitCodeForError(err));
    });
}

module.exports = {
  // CLI surface (main + arg parser).
  parseArgs,
  main,
  // Pipeline (testable).
  runPipeline,
  // Final checks.
  checkThresholds,
  checkRebrandLeak,
  // Helpers (unit-testable).
  countPresetArtifacts,
  countMdFlat,
  countDirsFlat,
  countMdRecursive,
  countHookGroups,
  walkPresetFiles,
  exitCodeForError,
  // Constants.
  VALID_PRESETS,
  MAIN_PRESETS,
  THRESHOLDS,
  REBRAND_LEAK_RE,
  REBRAND_SCAN_EXTS,
  COUNTABLE_DIRS,
  DEFAULT_APPENDIX_DIR,
  DEFAULT_SOURCE_ROOT,
  DEFAULT_OUTPUT_DIR,
  // Logger (cho tests + integration).
  logger,
};
