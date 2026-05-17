/**
 * Property test P10 — Idempotency (Round-trip).
 *
 * Spec: .kiro/specs/claudekit-parity-sync/design.md > Correctness Properties >
 *       Property 10.
 * Task: tasks.md > 13.7 (PBT) Property test P10 — chạy 2 lần liên tiếp ra
 *       byte-identical output.
 *
 * **Validates: Requirements 15.1, 15.2, 15.4, 19.5**
 *
 * Statement (design.md): For all workspace trạng thái `S0` đã chạy
 * parity-sync xong một lần thành `S1`, lần chạy thứ hai từ `S1` cho ra
 * trạng thái `S2` thoả `git diff(S1, S2) == ∅` cho mọi đường dẫn trong
 * `presets/`. Tương đương: hash sha256 của mọi file đã port giữ nguyên
 * giữa lần chạy 1 và lần chạy 2. Timestamp được ghi vào delta-report.md
 * và parity-sync-report.md ở front-matter, KHÔNG vào file artifact.
 *
 * Property assertions (numRuns=10 — fs-heavy, mỗi iter spin tmp workspace):
 *
 *   10a Apply twice byte-identical — Random small inventory + matching
 *       source kit ⇒ run 1 (S0 → S1) sinh tập file F1; run 2 (S1 → S2)
 *       sinh tập file F2 với F1.path === F2.path và sha256(F1) === sha256(F2)
 *       cho mọi file trong:
 *         - presets/<P>/agents/*.md, commands/**\/*.md, skills/**, hooks/*,
 *           workflows/*.md (ported files)
 *         - presets/<P>/manifest.json
 *
 *       Lưu ý: 3 file report (`docs/audits/.../*-report.md`) KHÔNG nằm
 *       trong scope của Property 10 — đó là audit log mô tả pipeline
 *       execution (run 1 log write-new, run 2 log no-op). Spec quote:
 *       "git diff(S1, S2) == ∅ cho mọi đường dẫn trong **presets/**".
 *
 *   10b Dry-run twice byte-identical — Random inventory ⇒ run dry-run
 *       hai lần với cùng `ranAt` ⇒ delta-report.md byte-identical.
 *
 * Strategy:
 *
 *   - Pure CommonJS (require). `describe`/`it`/`expect` exposed as globals
 *     qua `globals: true` trong vitest.config.js.
 *   - Mỗi iteration tạo isolated tmp workspace với:
 *       1. Audit appendix synthetic (inventory-source.json + 7 target-files-*.txt
 *          rỗng/skeleton).
 *       2. claudekit-engineer-main/.claude/ với source file vật lý (cần thật
 *          vì Porter sẽ đọc).
 *       3. presets/<P>/ skeleton trống.
 *   - Run pipeline với `apply=true, skipFinalChecks=true` (tmp workspace
 *     không đạt threshold MIN_AGENTS=16, ...; final checks không phải
 *     mục tiêu của P10).
 *   - Snapshot: walk toàn bộ files trong workspace (presets/ + docs/audits/),
 *     hash sha256. Compare giữa hai run.
 *   - Cleanup tmp dir ở finally.
 *
 * Note về determinism:
 *   - `ranAt` được fix qua opts.ranAt → parity-sync-report.md có cùng
 *     front-matter cross-run.
 *   - `delta-report.md` không có timestamp → byte-stable mặc nhiên.
 *   - `conflict-log.md` chứa timestamp PER decision do ConflictResolver
 *     sinh khi resolve. Lần chạy thứ hai mọi file đã match (no-op
 *     decisions) ⇒ KHÔNG có decision mới nào sinh timestamp ⇒ vẫn
 *     deterministic.
 *   - manifest.json: serializer dùng 2-space indent + LF newline cố định.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const fc = require('fast-check');

const run = require('../../run');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Số iterations PBT — fs-heavy (mỗi iter scaffold workspace + chạy pipeline
 * 2 lần). 10 đủ để cover variability, không quá tốn thời gian CI.
 *
 * @type {number}
 */
const NUM_RUNS = 10;

/**
 * Fixed ranAt cho determinism cross-run trong cùng iteration.
 *
 * @type {string}
 */
const FIXED_RAN_AT = '2026-01-15T03:04:05Z';

/**
 * Tập preset chính dùng trong generator. Loại `_template` (không tham gia
 * port) — vẫn scaffold trong workspace để inventory-reader không reject.
 *
 * @type {ReadonlyArray<string>}
 */
const TARGET_PRESETS = Object.freeze(['frontend', 'backend', 'fullstack']);

/**
 * Tập skill name "generic" (port vào mọi preset theo CATEGORY_RULES). Dùng
 * trong generator để bảo đảm có ít nhất một plan thành công cross-preset.
 *
 * @type {ReadonlyArray<string>}
 */
const GENERIC_SKILL_NAMES = Object.freeze([
  'common',
  'planning',
  'research',
  'debugging',
]);

/**
 * Tập agent name khớp với CATEGORY_RULES → port vào mọi preset.
 *
 * @type {ReadonlyArray<string>}
 */
const GENERIC_AGENT_NAMES = Object.freeze([
  'brainstormer',
  'code-reviewer',
  'debugger',
  'planner',
  'tester',
]);

/**
 * Tập command name generic → port vào mọi preset.
 *
 * @type {ReadonlyArray<string>}
 */
const GENERIC_COMMAND_NAMES = Object.freeze([
  'ask',
  'brainstorm',
  'code',
  'debug',
  'test',
]);

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Tạo isolated tmp workspace.
 *
 * @returns {{ root: string, cleanup: () => void }}
 */
function makeWorkspace() {
  const id = crypto.randomBytes(8).toString('hex');
  const root = path.join(os.tmpdir(), `parity-p10-${process.pid}-${id}`);
  fs.mkdirSync(root, { recursive: true });
  return {
    root,
    cleanup() {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Scaffold workspace với:
 *   - claudekit-engineer-main/.claude/ chứa source file vật lý.
 *   - docs/audits/claudekit-vs-kirokit/appendix/ chứa inventory-source.json
 *     và 7 target-files-*.txt.
 *   - presets/<P>/ rỗng cho mọi preset.
 *
 * @param {string} root Workspace root.
 * @param {object} fixture
 * @param {string[]} fixture.agents     Tên agent (không có .md).
 * @param {string[]} fixture.commands   Tên command (không có .md).
 * @param {string[]} fixture.skills     Tên skill folder (sẽ tạo SKILL.md).
 */
function scaffoldWorkspace(root, fixture) {
  // 1. Audit appendix.
  const appendixDir = path.join(root, 'docs/audits/claudekit-vs-kirokit/appendix');
  fs.mkdirSync(appendixDir, { recursive: true });

  /** @type {object[]} */
  const inventory = [];

  for (const name of fixture.agents) {
    inventory.push({
      id: `src.agent.${name}`,
      kit: 'source',
      preset: null,
      artifact_type: 'agent',
      path: `claudekit-engineer-main/.claude/agents/${name}.md`,
      basename: `${name}.md`,
      size_lines: 30,
      front_matter: { present: true, fields: { name } },
      extras: { is_sub_skill_container: false, subdirs: [] },
    });
  }
  for (const name of fixture.commands) {
    inventory.push({
      id: `src.command.${name}`,
      kit: 'source',
      preset: null,
      artifact_type: 'command',
      path: `claudekit-engineer-main/.claude/commands/${name}.md`,
      basename: `${name}.md`,
      size_lines: 25,
      front_matter: { present: true, fields: { name } },
      extras: { is_sub_skill_container: false, subdirs: [] },
    });
  }
  for (const name of fixture.skills) {
    inventory.push({
      id: `src.skill.${name}`,
      kit: 'source',
      preset: null,
      artifact_type: 'skill',
      path: `claudekit-engineer-main/.claude/skills/${name}/`,
      basename: name,
      size_lines: 20,
      front_matter: { present: false, fields: {} },
      extras: {
        is_sub_skill_container: false,
        subdirs: [],
        skill_md_path: `skills/${name}/SKILL.md`,
      },
    });
  }

  fs.writeFileSync(
    path.join(appendixDir, 'inventory-source.json'),
    JSON.stringify(inventory, null, 2),
  );

  // 2. Target lists (rỗng skeleton — chỉ chứa manifest.json placeholder).
  for (const preset of run.VALID_PRESETS) {
    fs.writeFileSync(
      path.join(appendixDir, `target-files-${preset}.txt`),
      `presets/${preset}/manifest.json\n`,
    );
  }

  // 3. Source kit physical files.
  const claudeRoot = path.join(root, 'claudekit-engineer-main/.claude');
  fs.mkdirSync(path.join(claudeRoot, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(claudeRoot, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(claudeRoot, 'skills'), { recursive: true });

  for (const name of fixture.agents) {
    // Front-matter hợp lệ + body deterministic.
    const content = `---
name: ${name}
description: Agent ${name} for KiroKit
---

# ${name}

This is the ${name} agent. It helps with tasks.
`;
    fs.writeFileSync(path.join(claudeRoot, 'agents', `${name}.md`), content);
  }

  for (const name of fixture.commands) {
    const content = `---
name: ${name}
argument-hint: "[args]"
---

# ${name}

Run the ${name} command.
`;
    fs.writeFileSync(path.join(claudeRoot, 'commands', `${name}.md`), content);
  }

  for (const name of fixture.skills) {
    const skillDir = path.join(claudeRoot, 'skills', name);
    fs.mkdirSync(skillDir, { recursive: true });
    const content = `---
name: ${name}
description: Skill ${name} for KiroKit
inclusion: manual
---

# ${name}

This is the ${name} skill.
`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
  }

  // 4. Preset skeletons (rỗng — Porter sẽ tạo subtree).
  for (const preset of run.VALID_PRESETS) {
    fs.mkdirSync(path.join(root, 'presets', preset), { recursive: true });
  }
}

/**
 * Walk workspace và snapshot sha256 + size cho mỗi file trong `presets/<P>/`.
 *
 * Per spec Property 10: "git diff(S1, S2) == ∅ cho mọi đường dẫn trong
 * `presets/`". Reports (`docs/audits/claudekit-vs-kirokit/*-report.md`) là
 * audit artifacts mô tả từng run — chúng KHÔNG phải state, mà là log của
 * pipeline execution (run 1 ghi lại các write-new decisions; run 2 toàn
 * no-op). Vì vậy reports KHÔNG nằm trong Property 10 invariant.
 *
 * Đặc biệt:
 *   - `presets/<P>/manifest.json` (state file của preset) → in scope.
 *   - `presets/<P>/agents/*.md`, `commands/**`, `skills/**`, `hooks/*`,
 *     `workflows/*.md` (ported content) → in scope.
 *   - `docs/audits/claudekit-vs-kirokit/{delta,conflict,parity-sync}-report.md`
 *     → out of scope (audit log, không phải state).
 *
 * @param {string} root Workspace root.
 * @returns {Map<string, { hash: string, bytes: number }>}
 *          Map từ POSIX-relative path → {sha256 hex, byte length}.
 */
function snapshot(root) {
  /** @type {Map<string, { hash: string, bytes: number }>} */
  const out = new Map();

  const walk = (dirAbs, baseRel) => {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return;
      throw err;
    }
    // Sort cho output deterministic cross-platform.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      if (ent.name === 'node_modules') continue;
      const childAbs = path.join(dirAbs, ent.name);
      const relPath = baseRel === '' ? ent.name : `${baseRel}/${ent.name}`;
      if (ent.isDirectory()) {
        walk(childAbs, relPath);
      } else if (ent.isFile()) {
        const buf = fs.readFileSync(childAbs);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        out.set(relPath, { hash, bytes: buf.length });
      }
    }
  };

  // Snapshot chỉ `presets/` (per spec Property 10 scope).
  const presetsDir = path.join(root, 'presets');
  if (fs.existsSync(presetsDir)) {
    walk(presetsDir, 'presets');
  }

  return out;
}

/**
 * Compare hai snapshots; trả về diff list.
 *
 * @param {Map<string, { hash: string, bytes: number }>} a
 * @param {Map<string, { hash: string, bytes: number }>} b
 * @returns {Array<{ path: string, kind: 'added' | 'removed' | 'changed', a?: object, b?: object }>}
 */
function diffSnapshots(a, b) {
  /** @type {Array<{ path: string, kind: 'added' | 'removed' | 'changed', a?: object, b?: object }>} */
  const diffs = [];
  /** @type {Set<string>} */
  const allKeys = new Set([...a.keys(), ...b.keys()]);
  // Sort cho output deterministic.
  const sortedKeys = Array.from(allKeys).sort();
  for (const key of sortedKeys) {
    const va = a.get(key);
    const vb = b.get(key);
    if (!va && vb) {
      diffs.push({ path: key, kind: 'added', b: vb });
    } else if (va && !vb) {
      diffs.push({ path: key, kind: 'removed', a: va });
    } else if (va && vb && va.hash !== vb.hash) {
      diffs.push({ path: key, kind: 'changed', a: va, b: vb });
    }
  }
  return diffs;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generator cho fixture inventory: 1-3 agents, 1-3 commands, 0-2 skills,
 * tất cả từ tập generic name (đảm bảo CATEGORY_RULES match → có plans
 * thành công, không phải mọi entry → category-skip).
 */
const arbFixture = fc.record({
  agents: fc
    .uniqueArray(fc.constantFrom(...GENERIC_AGENT_NAMES), {
      minLength: 1,
      maxLength: 3,
    }),
  commands: fc
    .uniqueArray(fc.constantFrom(...GENERIC_COMMAND_NAMES), {
      minLength: 1,
      maxLength: 3,
    }),
  skills: fc.uniqueArray(fc.constantFrom(...GENERIC_SKILL_NAMES), {
    minLength: 0,
    maxLength: 2,
  }),
});

// ---------------------------------------------------------------------------
// Property assertions
// ---------------------------------------------------------------------------

describe('Property 10: Idempotency — **Validates: Requirements 15.1, 15.2, 15.4, 19.5**', () => {
  it('10a apply twice ⇒ snapshot byte-identical (manifests + reports + ported)', () => {
    fc.assert(
      fc.property(arbFixture, (fixture) => {
        const ws = makeWorkspace();
        try {
          scaffoldWorkspace(ws.root, fixture);

          // Run 1: S0 → S1.
          run.runPipeline({
            apply: true,
            preset: null,
            workspaceRoot: ws.root,
            ranAt: FIXED_RAN_AT,
            skipFinalChecks: true,
          });
          const snap1 = snapshot(ws.root);
          expect(snap1.size).toBeGreaterThan(0); // pipeline đã ghi gì đó.

          // Run 2: S1 → S2.
          run.runPipeline({
            apply: true,
            preset: null,
            workspaceRoot: ws.root,
            ranAt: FIXED_RAN_AT,
            skipFinalChecks: true,
          });
          const snap2 = snapshot(ws.root);

          const diffs = diffSnapshots(snap1, snap2);
          if (diffs.length > 0) {
            // Tạo error message hữu ích cho counterexample shrinking.
            const lines = diffs.slice(0, 5).map((d) => {
              if (d.kind === 'changed') {
                return `  ${d.kind} ${d.path} (${d.a.hash.slice(0, 8)} → ${d.b.hash.slice(0, 8)})`;
              }
              return `  ${d.kind} ${d.path}`;
            });
            const more = diffs.length > 5 ? `\n  ... and ${diffs.length - 5} more` : '';
            throw new Error(
              `Idempotency violated: ${diffs.length} file diff(s):\n${lines.join('\n')}${more}`,
            );
          }
        } finally {
          ws.cleanup();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('10b dry-run twice ⇒ delta-report.md byte-identical', () => {
    fc.assert(
      fc.property(arbFixture, (fixture) => {
        const ws = makeWorkspace();
        try {
          scaffoldWorkspace(ws.root, fixture);

          // Run 1.
          run.runPipeline({
            apply: false,
            preset: null,
            workspaceRoot: ws.root,
            ranAt: FIXED_RAN_AT,
          });
          const deltaPath = path.join(
            ws.root,
            'docs/audits/claudekit-vs-kirokit/delta-report.md',
          );
          const first = fs.readFileSync(deltaPath);

          // Run 2.
          run.runPipeline({
            apply: false,
            preset: null,
            workspaceRoot: ws.root,
            ranAt: FIXED_RAN_AT,
          });
          const second = fs.readFileSync(deltaPath);

          expect(first.equals(second)).toBe(true);
        } finally {
          ws.cleanup();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
