/**
 * Porter for ClaudeKit Parity Sync.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 3 / 10.1–10.4 — execute `PortPlan[]`, gọi Rebrander cho text
 *        files, áp ConflictResolver, ghi qua AtomicWriter, track portedFiles
 *        per preset cho rollback, skip file thiếu front-matter hợp lệ
 *        (edge 3.7).
 *
 * Trách nhiệm (design.md > Components and Interfaces > Porter + Rebrander):
 *
 *   "Porter thực thi PortPlan, gọi Rebrander cho mọi file text (.md, .json,
 *    .js, .sh, .ps1, .py)."
 *
 *   Pipeline integration (per design > Pipeline tổng quan):
 *     - Nhận `PortPlan[]` từ PortPlanner (đã filter qua CategoryMapper).
 *     - Cho mỗi plan:
 *        1. Đọc source file (hoặc thư mục) tại
 *           `<sourceRoot>/<plan.source_path>`.
 *        2. Nếu plan yêu cầu front-matter (transforms chứa `frontmatter-keep`)
 *           và file `.md` source có YAML malformed, skip + warning (Req 3.7).
 *        3. Nếu file là text, áp Rebrander với `targetPath` để detect
 *           exception `skills/claude-code/`. Non-text (binary, ví dụ `.xsd`)
 *           pass-through bytes nguyên xi (Req 4.13, Property 12).
 *        4. Cho mỗi `target_path` trong plan:
 *           a. Gọi `ConflictResolver.resolve` để quyết định write/skip.
 *           b. Ngoài chế độ dry-run, gọi `applyDecision` (qua AtomicWriter).
 *           c. Tracking trong `portedFiles` cho rollback per preset
 *              (task 10.2, design > Error recovery strategy).
 *
 *   Sub-skill containers (design > PortPlanner > sub-skill-split + Porter
 *   note): `source_path` của plan đó là một directory (`skills/document-skills/
 *   docx/`); Porter walk subtree và port từng file. PortPlanner đã đảm bảo
 *   chỉ phát một plan/sub-skill, nên Porter không cần tự split lại.
 *
 *   Tri-script-extend (design > PortPlanner > tri-script-extend): plan có
 *   `target_paths = [..sh, ..js, ..ps1]`; Porter ghi rebranded `.sh` content
 *   cho `.sh`, sinh placeholder stubs cho `.js`/`.ps1`. Trên dữ liệu thực
 *   các hook `.sh`-only đã bị CategoryMapper loại; nhánh này chạy defensively.
 *
 *   Edge 3.7 (Req 3.7): "IF một agent file trong source không có YAML
 *   front-matter hợp lệ, THEN ghi warning vào delta-report.md và bỏ qua
 *   agent đó." Implementation: với mọi `.md` file mà plan có
 *   `frontmatter-keep` transform, gọi `yamlFrontMatter.parse` trước; nếu
 *   throw `E_FRONTMATTER`, push vào `skipped` + `warnings`, không gọi
 *   Rebrander/ConflictResolver/AtomicWriter cho file đó.
 *
 *   Rollback (task 10.2, design > Error Handling > Error recovery strategy):
 *   "Mỗi preset là một transaction atomic ở mức ManifestUpdater. Nếu manifest
 *   update fail, mọi file vừa ghi cho preset đó được xoá (tracked qua list
 *   `portedFiles`)." Porter trả `ported: PortedFile[]`; orchestrator
 *   (`run.js` task 13.x) lọc theo preset và xoá khi cần.
 *
 * Output shape:
 *
 *   {
 *     ported:    PortedFile[]    // files actually written (decision ∈
 *                                // {write-new, sidecar, merged-frontmatter,
 *                                //  json-merged} & not dry-run)
 *     skipped:   SkippedFile[]   // files skipped (malformed FM, missing src)
 *     decisions: ConflictDecision[]  // mọi decision (kể cả no-op/kept-target)
 *     warnings:  string[]        // human-readable warnings cho Reporter
 *   }
 *
 *   PortedFile  = { source_path, target_path, decision, target_preset }
 *   SkippedFile = { source_path, target_preset, reason }
 *
 * Pure CommonJS. Sync I/O (script chạy maintainer-time, file nhỏ — pattern
 * khớp với atomic-writer.js / hash-utils.js trong cùng pipeline).
 *
 * @typedef {import('./conflict-resolver').ConflictDecision} ConflictDecision
 *
 * @typedef {object} PortedFile
 * @property {string} source_path
 * @property {string} target_path     POSIX-style (giữ form của plan).
 * @property {string} decision        ConflictDecision.decision value.
 * @property {string} target_preset
 *
 * @typedef {object} SkippedFile
 * @property {string} source_path
 * @property {string} target_preset
 * @property {string} reason          'malformed-front-matter' | 'source-not-found'
 *                                    | 'unsupported-tri-script-ext'.
 *
 * @typedef {object} PortResult
 * @property {PortedFile[]} ported
 * @property {SkippedFile[]} skipped
 * @property {ConflictDecision[]} decisions
 * @property {string[]} warnings
 */

'use strict';

const fs = require('fs');
const path = require('path');

const rebrander = require('./rebrander');
const conflictResolver = require('./conflict-resolver');
const yamlFrontMatter = require('./lib/yaml-front-matter');
const { toOsPath } = require('./lib/path-utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Extensions Porter coi là "text" — sẽ được decode UTF-8 và đẩy qua
 * Rebrander. Khớp với design.md "Porter thực thi PortPlan, gọi Rebrander
 * cho mọi file text (.md, .json, .js, .sh, .ps1, .py)" + `.txt` (env
 * example, README sub-files trong skill scripts/).
 *
 * Frozen Set để O(1) lookup và bảo vệ runtime mutation.
 *
 * @type {ReadonlySet<string>}
 */
const TEXT_EXTS = Object.freeze(
  new Set(['.md', '.json', '.js', '.sh', '.ps1', '.py', '.txt']),
);

/**
 * Decisions trigger ghi disk (cần track vào `ported` cho rollback). Dùng
 * Set để branch nhanh khi quyết định push.
 *
 * Bao gồm:
 *   - 'write-new'           — file target chưa tồn tại.
 *   - 'sidecar'             — Tier 3 tạo `<base>.source<ext>`.
 *   - 'merged-frontmatter'  — Tier 2 ghi target body với merged FM.
 *   - 'json-merged'         — JSON deep-merge bypass tier tree.
 *
 * KHÔNG include:
 *   - 'no-op' / 'kept-target'  — không ghi gì.
 *
 * @type {ReadonlySet<string>}
 */
const WRITE_DECISIONS = Object.freeze(
  new Set(['write-new', 'sidecar', 'merged-frontmatter', 'json-merged']),
);

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/**
 * Lấy extension lowercase (kèm dấu chấm) của một POSIX path. Ví dụ
 * `getExt('foo/bar.MD') === '.md'`. Trả về `''` cho path không có ext
 * hoặc kết thúc bằng `/`.
 *
 * @param {string} p
 * @returns {string}
 */
function getExt(p) {
  if (typeof p !== 'string' || p === '' || p.endsWith('/')) return '';
  const m = /\.[^./]+$/.exec(p);
  return m ? m[0].toLowerCase() : '';
}

/**
 * @param {string} p
 * @returns {boolean}
 */
function isTextFile(p) {
  return TEXT_EXTS.has(getExt(p));
}

/**
 * Convert một POSIX relative path sang absolute OS path bằng cách join với
 * root. Wrapper an toàn: strip trailing slash của relative trước khi
 * `path.join` (path.join sẽ tự normalize, nhưng giữ trailing slash với
 * directory marker không cần thiết khi đọc fs).
 *
 * @param {string} root Absolute path.
 * @param {string} relPosix POSIX relative path (có thể end với `/`).
 * @returns {string}
 */
function toAbsOs(root, relPosix) {
  const rel = relPosix.replace(/\/+$/, '');
  if (rel === '') return root;
  return path.join(root, toOsPath(rel));
}

/**
 * Walk một directory đệ quy, trả về danh sách file POSIX-relative paths
 * (tương đối với `dir`). Skip symlink để tránh nhánh không kết thúc.
 *
 * @param {string} dir Absolute OS path tới directory cần walk.
 * @returns {string[]} POSIX-style relative paths (`refs/foo.md`,
 *   `scripts/run.py`, ...).
 */
function walkFilesPosix(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} subAbs Absolute path đang walk. */
  /** @param {string} subRel POSIX relative path từ root. */
  function walk(subAbs, subRel) {
    /** @type {fs.Dirent[]} */
    const entries = fs.readdirSync(subAbs, { withFileTypes: true });
    // Sort để output deterministic (Property 10 idempotency cần thứ tự ổn
    // định cho list ported/decisions cross-platform).
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      const childAbs = path.join(subAbs, ent.name);
      const childRel = subRel === '' ? ent.name : `${subRel}/${ent.name}`;
      if (ent.isDirectory()) {
        walk(childAbs, childRel);
      } else if (ent.isFile()) {
        out.push(childRel);
      }
      // Other types (FIFO, socket) skip.
    }
  }
  walk(dir, '');
  return out;
}

/**
 * Sinh stub content cho biến thể script (.js / .ps1) khi tri-script-extend.
 *
 * Không rebrand stub này (nó được sinh mới, không phải port từ source) —
 * giữ deterministic output cho idempotency. Comment kèm hint cho
 * maintainer review/hoàn thiện logic.
 *
 * @param {string} ext '.js' hoặc '.ps1'.
 * @param {string} basename Basename (không ext) của source `.sh`.
 * @returns {string}
 */
function makeTriScriptStub(ext, basename) {
  if (ext === '.js') {
    return (
      `// Auto-generated stub for tri-script parity with ${basename}.sh.\n`
      + `// TODO: port shell logic to Node.js. See ${basename}.sh for reference.\n`
      + `// Spec: .kiro/specs/claudekit-parity-sync/ (Requirement 7.4 — tri-script .js).\n`
    );
  }
  if (ext === '.ps1') {
    return (
      `# Auto-generated stub for tri-script parity with ${basename}.sh.\n`
      + `# TODO: port shell logic to PowerShell. See ${basename}.sh for reference.\n`
      + `# Spec: .kiro/specs/claudekit-parity-sync/ (Requirement 7.4 — tri-script .ps1).\n`
    );
  }
  // Defensive fallback — không xảy ra với target_paths chuẩn.
  return '';
}

/**
 * Push warning + skipped entry trong một call.
 *
 * @param {object} ctx Internal context (xem `port`).
 * @param {string} sourcePath
 * @param {string} targetPreset
 * @param {string} reason
 * @param {string} message Human-readable warning.
 */
function recordSkip(ctx, sourcePath, targetPreset, reason, message) {
  ctx.skipped.push({ source_path: sourcePath, target_preset: targetPreset, reason });
  ctx.warnings.push(message);
}

// ---------------------------------------------------------------------------
// Per-target write
// ---------------------------------------------------------------------------

/**
 * Resolve + apply một (source content → target_path) pair. Append decision
 * vào ctx.decisions; nếu ghi disk (decision ∈ WRITE_DECISIONS và !dryRun)
 * thì append vào ctx.ported.
 *
 * @param {object} args
 * @param {object} args.ctx
 * @param {string} args.sourcePath        Source path POSIX (cho tracking).
 * @param {string} args.targetPathPosix   Target POSIX (cho tracking).
 * @param {string|Buffer} args.content    Content đã ready (đã rebrand nếu cần).
 * @param {string} args.targetPreset
 */
function resolveAndApply(args) {
  const { ctx, sourcePath, targetPathPosix, content, targetPreset } = args;
  const targetOsPath = toAbsOs(ctx.targetRoot, targetPathPosix);

  const decision = conflictResolver.resolve({
    targetPath: targetOsPath,
    sourceContent: content,
    sessionState: ctx.sessionState || undefined,
  });

  ctx.decisions.push(decision);

  if (ctx.dryRun) {
    return;
  }

  // applyDecision tự handle no-op / kept-target (return wrote=false).
  const applyResult = conflictResolver.applyDecision(decision, { sourceContent: content });

  if (applyResult.wrote && WRITE_DECISIONS.has(decision.decision)) {
    // Track POSIX-style target_path để Reporter (task 12) format thuần
    // POSIX trong delta-report.md cross-platform.
    /** @type {PortedFile} */
    const ported = {
      source_path: sourcePath,
      target_path: targetPathPosix,
      decision: decision.decision,
      target_preset: targetPreset,
    };
    if (decision.decision === 'sidecar' && decision.sidecar_path) {
      // Sidecar ghi vào sidecar_path, không phải target_path. Lưu lại path
      // thật để rollback có thể xoá đúng file.
      ported.target_path = posixOf(ctx.targetRoot, decision.sidecar_path);
    }
    ctx.ported.push(ported);
  }
}

/**
 * Convert một absolute OS path về POSIX relative form (so với `root`).
 * Dùng để giữ tracking field `target_path` ở dạng POSIX dù
 * ConflictResolver trả OS-native sidecar_path.
 *
 * @param {string} root Absolute OS path.
 * @param {string} absOs Absolute OS path under root.
 * @returns {string}
 */
function posixOf(root, absOs) {
  const rel = path.relative(root, absOs);
  return rel.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Per-plan execution
// ---------------------------------------------------------------------------

/**
 * Edge 3.7 check: đối với file `.md` mà plan yêu cầu `frontmatter-keep`,
 * verify YAML hợp lệ. Trả `false` nếu malformed (caller skip), `true` nếu
 * OK. Mọi error khác được rethrow.
 *
 * @param {Buffer} buf
 * @param {object} plan
 * @param {string} sourcePath
 * @param {object} ctx
 * @returns {boolean}
 */
function checkFrontMatter(buf, plan, sourcePath, ctx) {
  const transforms = Array.isArray(plan.transforms) ? plan.transforms : [];
  if (!transforms.includes('frontmatter-keep')) return true;
  if (getExt(sourcePath) !== '.md') return true;

  try {
    yamlFrontMatter.parse(buf.toString('utf8'));
    return true;
  } catch (err) {
    if (err && err.code === 'E_FRONTMATTER') {
      recordSkip(
        ctx,
        sourcePath,
        plan.target_preset,
        'malformed-front-matter',
        `[E_FRONTMATTER] ${sourcePath} (preset=${plan.target_preset}): ${err.message || 'invalid YAML front-matter'}`,
      );
      return false;
    }
    throw err;
  }
}

/**
 * Process một plan với source là single file (không phải directory).
 *
 * @param {object} plan
 * @param {string} sourceFsPath  Absolute OS path tới source file.
 * @param {object} ctx
 */
function portFilePlan(plan, sourceFsPath, ctx) {
  const sourcePath = plan.source_path;
  const buf = fs.readFileSync(sourceFsPath);

  if (!checkFrontMatter(buf, plan, sourcePath, ctx)) {
    return;
  }

  const transforms = Array.isArray(plan.transforms) ? plan.transforms : [];
  const isTriScript = transforms.includes('tri-script-extend');

  // Tri-script: source `.sh` → ghi `.sh` (rebranded) + stubs `.js`/`.ps1`.
  if (isTriScript) {
    portTriScriptPlan(plan, buf, ctx);
    return;
  }

  // Standard: rebrand text content (or pass-through binary), ghi cho mỗi
  // target_path. Trong dữ liệu thực, single-file plans có đúng 1 target_path
  // (sub-skill-split phát nhiều plans, không nhiều target_paths). Vẫn loop
  // defensively để API ổn định.
  /** @type {string|Buffer} */
  let content;
  if (isTextFile(sourcePath)) {
    // Rebrand cần targetPath để detect exception `skills/claude-code/`.
    // Dùng target_path đầu tiên — mọi target_path trong cùng plan thuộc
    // cùng preset, chỉ khác preset prefix; exception detection dựa trên
    // substring `skills/claude-code/` nên đồng nhất.
    content = rebrander.rebrand(buf.toString('utf8'), {
      targetPath: plan.target_paths[0],
    });
  } else {
    content = buf;
  }

  for (const targetPathPosix of plan.target_paths) {
    resolveAndApply({
      ctx,
      sourcePath,
      targetPathPosix,
      content,
      targetPreset: plan.target_preset,
    });
  }
}

/**
 * Process tri-script-extend plan: source `.sh`, target_paths chứa cả
 * `.sh`, `.js`, `.ps1`. `.sh` ghi rebranded source content; `.js`/`.ps1`
 * ghi placeholder stub. Bất kỳ extension khác trong target_paths được skip
 * + warning (defensive).
 *
 * @param {object} plan
 * @param {Buffer} buf Source `.sh` content as bytes.
 * @param {object} ctx
 */
function portTriScriptPlan(plan, buf, ctx) {
  const sourcePath = plan.source_path;
  const sourceText = buf.toString('utf8');
  // Rebrand `.sh` content với target chính (`.sh` target). Stubs không
  // rebrand vì chúng được sinh mới, không port từ source.
  const shTarget = plan.target_paths.find((p) => getExt(p) === '.sh') || plan.target_paths[0];
  const shContent = rebrander.rebrand(sourceText, { targetPath: shTarget });

  const baseRel = sourcePath.replace(/\.sh$/i, '');
  const baseName = baseRel.split('/').pop() || 'hook';

  for (const targetPathPosix of plan.target_paths) {
    const ext = getExt(targetPathPosix);
    /** @type {string} */
    let content;
    if (ext === '.sh') {
      content = shContent;
    } else if (ext === '.js' || ext === '.ps1') {
      content = makeTriScriptStub(ext, baseName);
    } else {
      recordSkip(
        ctx,
        sourcePath,
        plan.target_preset,
        'unsupported-tri-script-ext',
        `[tri-script-extend] Bỏ qua target ${targetPathPosix}: extension ${ext || '(none)'} không hỗ trợ.`,
      );
      continue;
    }
    resolveAndApply({
      ctx,
      sourcePath,
      targetPathPosix,
      content,
      targetPreset: plan.target_preset,
    });
  }
}

/**
 * Process một plan với source là directory (skill folder, sub-skill
 * container subdirectory). Walk subtree; cho mỗi file:
 *   - Compute target POSIX = `<basePosix>/<rel>`.
 *   - Áp edge 3.7 check (skip malformed FM cho `.md` nếu plan có
 *     `frontmatter-keep`).
 *   - Rebrand text (extension trong TEXT_EXTS), pass-through binary.
 *   - resolveAndApply cho target.
 *
 * Plan target_paths của directory plans ở stage hiện tại luôn có 1 entry
 * (kết thúc `/`). Nếu nhiều entries (lý thuyết), Porter sẽ áp cho tất cả.
 *
 * @param {object} plan
 * @param {string} sourceFsPath Absolute OS path tới source directory.
 * @param {object} ctx
 */
function portDirectoryPlan(plan, sourceFsPath, ctx) {
  const transforms = Array.isArray(plan.transforms) ? plan.transforms : [];
  const requiresFrontmatter = transforms.includes('frontmatter-keep');

  const fileRels = walkFilesPosix(sourceFsPath);

  for (const fileRel of fileRels) {
    const fileFsPath = path.join(sourceFsPath, toOsPath(fileRel));
    const buf = fs.readFileSync(fileFsPath);
    const filePosixSource = `${plan.source_path.replace(/\/+$/, '')}/${fileRel}`;

    // Edge 3.7: chỉ check `.md` files khi plan có frontmatter-keep.
    if (requiresFrontmatter && getExt(fileRel) === '.md') {
      try {
        yamlFrontMatter.parse(buf.toString('utf8'));
      } catch (err) {
        if (err && err.code === 'E_FRONTMATTER') {
          recordSkip(
            ctx,
            filePosixSource,
            plan.target_preset,
            'malformed-front-matter',
            `[E_FRONTMATTER] ${filePosixSource} (preset=${plan.target_preset}): ${err.message || 'invalid YAML front-matter'}`,
          );
          continue;
        }
        throw err;
      }
    }

    /** @type {string|Buffer} */
    let content;
    if (isTextFile(fileRel)) {
      // Rebrand với target POSIX để detect skills/claude-code/ exception.
      const baseTargetPosix = plan.target_paths[0].replace(/\/+$/, '');
      const targetPathPosix = `${baseTargetPosix}/${fileRel}`;
      content = rebrander.rebrand(buf.toString('utf8'), { targetPath: targetPathPosix });
    } else {
      content = buf;
    }

    for (const baseTargetPosixRaw of plan.target_paths) {
      const baseTargetPosix = baseTargetPosixRaw.replace(/\/+$/, '');
      const targetPathPosix = `${baseTargetPosix}/${fileRel}`;
      resolveAndApply({
        ctx,
        sourcePath: filePosixSource,
        targetPathPosix,
        content,
        targetPreset: plan.target_preset,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute mảng `PortPlan[]` qua pipeline (Rebrander → ConflictResolver →
 * AtomicWriter), tracking ported / skipped / decisions / warnings.
 *
 * @param {object[]} plans PortPlan[] từ PortPlanner.
 * @param {object} options
 * @param {string} options.sourceRoot Absolute path tới thư mục `.claude/`
 *        của source kit (e.g.,
 *        `<workspace>/claudekit-engineer-main/.claude`). PortPlan.source_path
 *        đã strip prefix này nên Porter join lại.
 * @param {string} [options.targetRoot] Absolute path workspace root (nơi
 *        chứa `presets/`). Mặc định = `process.cwd()`. Test harness truyền
 *        tmp dir để cô lập.
 * @param {boolean} [options.dryRun] Nếu true, chỉ compute decisions, không
 *        ghi disk. Mặc định false.
 * @param {{ resolvedSidecars?: Set<string> }} [options.sessionState]
 *        Forward tới ConflictResolver (Req 12.4 sidecar idempotency).
 * @returns {PortResult}
 * @throws {TypeError} Nếu input shape không hợp lệ.
 */
function port(plans, options) {
  if (!Array.isArray(plans)) {
    throw new TypeError('port: plans phải là array (PortPlan[]).');
  }
  if (!options || typeof options !== 'object') {
    throw new TypeError('port: options phải là object có ít nhất sourceRoot.');
  }
  if (typeof options.sourceRoot !== 'string' || options.sourceRoot === '') {
    throw new TypeError('port: options.sourceRoot bắt buộc (absolute path tới .claude/).');
  }

  const ctx = {
    sourceRoot: options.sourceRoot,
    targetRoot:
      typeof options.targetRoot === 'string' && options.targetRoot !== ''
        ? options.targetRoot
        : process.cwd(),
    dryRun: Boolean(options.dryRun),
    sessionState:
      options.sessionState && typeof options.sessionState === 'object'
        ? options.sessionState
        : null,
    /** @type {PortedFile[]} */
    ported: [],
    /** @type {SkippedFile[]} */
    skipped: [],
    /** @type {ConflictDecision[]} */
    decisions: [],
    /** @type {string[]} */
    warnings: [],
  };

  for (const plan of plans) {
    if (!plan || typeof plan !== 'object') continue;
    if (typeof plan.source_path !== 'string' || plan.source_path === '') continue;
    if (!Array.isArray(plan.target_paths) || plan.target_paths.length === 0) continue;
    if (typeof plan.target_preset !== 'string' || plan.target_preset === '') continue;

    const sourceFsPath = toAbsOs(ctx.sourceRoot, plan.source_path);

    /** @type {fs.Stats} */
    let stat;
    try {
      stat = fs.statSync(sourceFsPath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        recordSkip(
          ctx,
          plan.source_path,
          plan.target_preset,
          'source-not-found',
          `[source-not-found] ${plan.source_path} (preset=${plan.target_preset}): không thấy file/thư mục source.`,
        );
        continue;
      }
      throw err;
    }

    if (stat.isDirectory()) {
      portDirectoryPlan(plan, sourceFsPath, ctx);
    } else if (stat.isFile()) {
      portFilePlan(plan, sourceFsPath, ctx);
    } else {
      // Symlinks / FIFO / device — skip với warning.
      recordSkip(
        ctx,
        plan.source_path,
        plan.target_preset,
        'source-not-found',
        `[unsupported-source-type] ${plan.source_path} (preset=${plan.target_preset}): không phải file hay directory.`,
      );
    }
  }

  return {
    ported: ctx.ported,
    skipped: ctx.skipped,
    decisions: ctx.decisions,
    warnings: ctx.warnings,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  port,
  // Exposed cho tests + callers cần introspection. Không thuộc public
  // surface chính của pipeline (run.js chỉ gọi `port`).
  TEXT_EXTS,
  WRITE_DECISIONS,
  walkFilesPosix,
  makeTriScriptStub,
};
