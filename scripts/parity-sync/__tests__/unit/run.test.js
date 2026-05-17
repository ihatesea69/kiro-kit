/**
 * Unit tests: run.js — CLI orchestration (parseArgs + runPipeline +
 * threshold/leak final checks + --preset filter).
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Tasks: tasks.md > 13.1–13.6
 *
 * Strategy:
 *
 *   1. **parseArgs.** Smoke test các flag combinations (default dry-run,
 *      --apply override, --preset value, --preset= form, invalid preset,
 *      help).
 *
 *   2. **runPipeline dry-run.** Build minimal isolated workspace với:
 *        - audit appendix (inventory-source.json + 7 target-files-*.txt)
 *        - presets/<P>/ skeleton (đủ để countPresetArtifacts không crash)
 *      Verify pipeline emits delta-report.md only, KHÔNG đụng presets/.
 *
 *   3. **--preset filter.** Verify `runPipeline({ preset: 'frontend' })`
 *      filter plans để chỉ giữ `target_preset === 'frontend'`.
 *
 *   4. **checkThresholds.** Direct unit test với synthetic preset dirs:
 *        - Đủ count → pass.
 *        - Thiếu count → throw E_THRESHOLD_FAIL với details.
 *
 *   5. **checkRebrandLeak.** Unit test với synthetic preset chứa file
 *      pattern leak:
 *        - Pristine content → pass.
 *        - File chứa "ClaudeKit" / ".claude/" / "Claude Code" → throw
 *          E_REBRAND_LEAK với details.
 *        - File trong skills/claude-code/ subtree → exception, không fail.
 *
 *   6. **exitCodeForError.** Smoke test mapping mỗi error code → exit code.
 *
 * Tất cả test dùng tmp workspace dưới `os.tmpdir()` cho isolation;
 * cleanup ở `afterEach` qua try/finally.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const run = require('../../run');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Tạo isolated tmp workspace với layout cơ bản:
 *   <root>/
 *     docs/audits/claudekit-vs-kirokit/appendix/
 *     presets/<P>/                  (rỗng skeleton cho 6 + _template)
 *
 * @returns {{ root: string, cleanup: () => void }}
 */
function makeWorkspace() {
  const id = crypto.randomBytes(8).toString('hex');
  const root = path.join(os.tmpdir(), `parity-run-${process.pid}-${id}`);
  fs.mkdirSync(path.join(root, 'docs/audits/claudekit-vs-kirokit/appendix'), {
    recursive: true,
  });
  for (const preset of run.VALID_PRESETS) {
    fs.mkdirSync(path.join(root, 'presets', preset), { recursive: true });
  }
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
 * Ghi minimal inventory cho dry-run smoke test. Đủ entries để pipeline
 * không crash, KHÔNG yêu cầu source files vật lý vì dry-run không gọi
 * Porter.
 *
 * @param {string} root Workspace root.
 */
function writeMinimalInventory(root) {
  const appendix = path.join(root, 'docs/audits/claudekit-vs-kirokit/appendix');
  // Source: 1 agent + 1 generic skill + 1 generic command — đủ để có ít
  // nhất 1 entry mỗi status enum trong delta-report summary.
  const source = [
    {
      id: 'src.agent.brainstormer',
      kit: 'source',
      preset: null,
      artifact_type: 'agent',
      path: 'claudekit-engineer-main/.claude/agents/brainstormer.md',
      basename: 'brainstormer.md',
      size_lines: 50,
      front_matter: { present: true, fields: { name: 'brainstormer' } },
      extras: { is_sub_skill_container: false, subdirs: [] },
    },
    {
      id: 'src.command.ask',
      kit: 'source',
      preset: null,
      artifact_type: 'command',
      path: 'claudekit-engineer-main/.claude/commands/ask.md',
      basename: 'ask.md',
      size_lines: 30,
      front_matter: { present: true, fields: {} },
      extras: { is_sub_skill_container: false, subdirs: [] },
    },
    {
      id: 'src.skill.common',
      kit: 'source',
      preset: null,
      artifact_type: 'skill',
      path: 'claudekit-engineer-main/.claude/skills/common/',
      basename: 'common',
      size_lines: 20,
      front_matter: { present: false, fields: {} },
      extras: {
        is_sub_skill_container: false,
        subdirs: ['references'],
        skill_md_path: 'skills/common/SKILL.md',
      },
    },
  ];
  fs.writeFileSync(path.join(appendix, 'inventory-source.json'), JSON.stringify(source));

  // Target: empty target-files-*.txt cho mọi preset (mọi source = missing).
  // File vẫn phải có ít nhất 1 entry để inventory-reader không reject với
  // E_INV_MISSING (rỗng = E_INV_MISSING). Ghi 1 placeholder line cho mỗi.
  for (const preset of run.VALID_PRESETS) {
    const placeholder = `presets/${preset}/manifest.json\n`;
    fs.writeFileSync(path.join(appendix, `target-files-${preset}.txt`), placeholder);
  }
}

/**
 * Scaffold một preset dir với đủ counts để pass thresholds. Dùng cho
 * checkThresholds tests.
 *
 * @param {string} root  Workspace root.
 * @param {string} preset
 * @param {object} opts
 * @param {number} [opts.agents]
 * @param {number} [opts.skills]
 * @param {number} [opts.commands]
 * @param {number} [opts.hooks]
 * @param {number} [opts.workflows]
 */
function scaffoldPreset(root, preset, opts) {
  const o = opts || {};
  const presetDir = path.join(root, 'presets', preset);

  // Agents: <n> .md files in agents/.
  const agentsDir = path.join(presetDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  for (let i = 0; i < (o.agents || 0); i += 1) {
    fs.writeFileSync(path.join(agentsDir, `agent-${i}.md`), `# agent-${i}\n`);
  }

  // Skills: <n> subdirectories trong skills/.
  const skillsDir = path.join(presetDir, 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  for (let i = 0; i < (o.skills || 0); i += 1) {
    const sub = path.join(skillsDir, `skill-${i}`);
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'SKILL.md'), `# skill-${i}\n`);
  }

  // Commands: <n> .md files trong commands/ (đệ quy đếm).
  const commandsDir = path.join(presetDir, 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });
  for (let i = 0; i < (o.commands || 0); i += 1) {
    fs.writeFileSync(path.join(commandsDir, `cmd-${i}.md`), `# cmd-${i}\n`);
  }

  // Hooks: <n> .js files trực tiếp trong hooks/.
  const hooksDir = path.join(presetDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  for (let i = 0; i < (o.hooks || 0); i += 1) {
    fs.writeFileSync(path.join(hooksDir, `hook-${i}.js`), `// hook-${i}\n`);
  }

  // Workflows: <n> .md files trực tiếp trong workflows/.
  const workflowsDir = path.join(presetDir, 'workflows');
  fs.mkdirSync(workflowsDir, { recursive: true });
  for (let i = 0; i < (o.workflows || 0); i += 1) {
    fs.writeFileSync(
      path.join(workflowsDir, `workflow-${i}.md`),
      `# workflow-${i}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// parseArgs tests
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('mặc định dry-run=true, apply=false, preset=null, help=false', () => {
    const args = run.parseArgs([]);
    expect(args.dryRun).toBe(true);
    expect(args.apply).toBe(false);
    expect(args.preset).toBeNull();
    expect(args.help).toBe(false);
  });

  it('--apply set apply=true, dryRun=false', () => {
    const args = run.parseArgs(['--apply']);
    expect(args.apply).toBe(true);
    expect(args.dryRun).toBe(false);
  });

  it('--apply override --dry-run khi cả hai cùng truyền', () => {
    const args = run.parseArgs(['--dry-run', '--apply']);
    expect(args.apply).toBe(true);
    expect(args.dryRun).toBe(false);
  });

  it('--preset frontend set preset', () => {
    const args = run.parseArgs(['--preset', 'frontend']);
    expect(args.preset).toBe('frontend');
  });

  it('--preset=backend (form equals) set preset', () => {
    const args = run.parseArgs(['--preset=backend']);
    expect(args.preset).toBe('backend');
  });

  it('--preset không có value → throw arg error với exitCode=2', () => {
    expect(() => run.parseArgs(['--preset'])).toThrow(/--preset cần một tên/);
    try {
      run.parseArgs(['--preset']);
    } catch (err) {
      expect(err.exitCode).toBe(2);
      expect(err.isArgError).toBe(true);
    }
  });

  it('--preset invalid → throw arg error', () => {
    expect(() => run.parseArgs(['--preset', 'nonexistent'])).toThrow(
      /Preset không hợp lệ/,
    );
  });

  it('--help set help=true (không validate preset)', () => {
    const args = run.parseArgs(['--help', '--preset', 'invalid']);
    expect(args.help).toBe(true);
  });

  it('cờ không nhận diện → throw arg error', () => {
    expect(() => run.parseArgs(['--unknown'])).toThrow(/Cờ không nhận diện được/);
  });
});

// ---------------------------------------------------------------------------
// runPipeline (dry-run) smoke test
// ---------------------------------------------------------------------------

describe('runPipeline — dry-run mode', () => {
  /** @type {{ root: string, cleanup: () => void }} */
  let ws;
  beforeEach(() => {
    ws = makeWorkspace();
    writeMinimalInventory(ws.root);
  });
  afterEach(() => ws.cleanup());

  it('emit chỉ delta-report.md, không tạo các file khác', () => {
    const result = run.runPipeline({
      apply: false,
      preset: null,
      workspaceRoot: ws.root,
    });

    expect(result.deltas.length).toBeGreaterThan(0);
    expect(result.ported).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.runResult).toBeNull();

    // delta-report.md tồn tại.
    const deltaPath = path.join(
      ws.root,
      'docs/audits/claudekit-vs-kirokit/delta-report.md',
    );
    expect(fs.existsSync(deltaPath)).toBe(true);

    // conflict-log.md + parity-sync-report.md KHÔNG tồn tại trong dry-run.
    const conflictPath = path.join(
      ws.root,
      'docs/audits/claudekit-vs-kirokit/conflict-log.md',
    );
    const runPath = path.join(
      ws.root,
      'docs/audits/claudekit-vs-kirokit/parity-sync-report.md',
    );
    expect(fs.existsSync(conflictPath)).toBe(false);
    expect(fs.existsSync(runPath)).toBe(false);
  });

  it('delta-report.md chứa Summary header + per-preset rows', () => {
    run.runPipeline({
      apply: false,
      preset: null,
      workspaceRoot: ws.root,
    });
    const deltaContent = fs.readFileSync(
      path.join(ws.root, 'docs/audits/claudekit-vs-kirokit/delta-report.md'),
      'utf8',
    );
    expect(deltaContent).toContain('# ClaudeKit Parity Sync — Delta Report');
    expect(deltaContent).toContain('## Summary');
    expect(deltaContent).toContain('| frontend |');
    expect(deltaContent).toContain('| backend |');
    expect(deltaContent).toContain('## Details');
  });

  it('idempotent: chạy 2 lần liên tiếp ra byte-identical delta-report', () => {
    run.runPipeline({
      apply: false,
      preset: null,
      workspaceRoot: ws.root,
      ranAt: '2026-01-15T03:04:05Z',
    });
    const deltaPath = path.join(
      ws.root,
      'docs/audits/claudekit-vs-kirokit/delta-report.md',
    );
    const first = fs.readFileSync(deltaPath);

    run.runPipeline({
      apply: false,
      preset: null,
      workspaceRoot: ws.root,
      ranAt: '2026-01-15T03:04:05Z',
    });
    const second = fs.readFileSync(deltaPath);

    expect(first.equals(second)).toBe(true);
  });

  it('--preset filter giảm số plans về 0 nếu preset không có delta missing', () => {
    // Cùng workspace nhưng filter `_template` (không nằm trong CATEGORY_RULES
    // → mọi entry → category-skip → 0 plans).
    const result = run.runPipeline({
      apply: false,
      preset: '_template',
      workspaceRoot: ws.root,
    });
    expect(result.plans.length).toBe(0);
  });

  it('--preset frontend filter giữ chỉ plans target_preset=frontend', () => {
    const result = run.runPipeline({
      apply: false,
      preset: 'frontend',
      workspaceRoot: ws.root,
    });
    for (const p of result.plans) {
      expect(p.target_preset).toBe('frontend');
    }
  });
});

// ---------------------------------------------------------------------------
// checkThresholds tests (Property 8)
// ---------------------------------------------------------------------------

describe('checkThresholds', () => {
  /** @type {{ root: string, cleanup: () => void }} */
  let ws;
  beforeEach(() => {
    ws = makeWorkspace();
  });
  afterEach(() => ws.cleanup());

  it('pass khi mọi preset đạt thresholds', () => {
    scaffoldPreset(ws.root, 'frontend', {
      agents: 16,
      skills: 28,
      commands: 40,
      hooks: 6,
      workflows: 4,
    });
    expect(() =>
      run.checkThresholds({ presets: ['frontend'], workspaceRoot: ws.root }),
    ).not.toThrow();
  });

  it('fail với E_THRESHOLD_FAIL khi agents thiếu', () => {
    scaffoldPreset(ws.root, 'frontend', {
      agents: 12, // thiếu (yêu cầu 16)
      skills: 28,
      commands: 40,
      hooks: 6,
      workflows: 4,
    });
    expect(() =>
      run.checkThresholds({ presets: ['frontend'], workspaceRoot: ws.root }),
    ).toThrow(/Threshold check failed/);

    try {
      run.checkThresholds({ presets: ['frontend'], workspaceRoot: ws.root });
    } catch (err) {
      expect(err.code).toBe('E_THRESHOLD_FAIL');
      expect(err.exitCode).toBe(5);
      expect(err.details).toEqual([
        {
          preset: 'frontend',
          gaps: { agents: { min: 16, actual: 12 } },
        },
      ]);
    }
  });

  it('fail liệt kê đa thresholds vi phạm trong một preset', () => {
    scaffoldPreset(ws.root, 'backend', {
      agents: 10,
      skills: 20,
      commands: 25,
      hooks: 6,
      workflows: 4,
    });
    try {
      run.checkThresholds({ presets: ['backend'], workspaceRoot: ws.root });
    } catch (err) {
      expect(err.code).toBe('E_THRESHOLD_FAIL');
      expect(err.details).toHaveLength(1);
      expect(err.details[0].gaps.agents).toEqual({ min: 16, actual: 10 });
      expect(err.details[0].gaps.skills).toEqual({ min: 28, actual: 20 });
      expect(err.details[0].gaps.commands).toEqual({ min: 40, actual: 25 });
      // hooks và workflows OK → không trong gaps.
      expect(err.details[0].gaps.hooks).toBeUndefined();
      expect(err.details[0].gaps.workflows).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// checkRebrandLeak tests (Property 4)
// ---------------------------------------------------------------------------

describe('checkRebrandLeak', () => {
  /** @type {{ root: string, cleanup: () => void }} */
  let ws;
  beforeEach(() => {
    ws = makeWorkspace();
  });
  afterEach(() => ws.cleanup());

  it('pass khi preset chỉ có content rebranded sạch', () => {
    const presetDir = path.join(ws.root, 'presets', 'frontend');
    fs.mkdirSync(path.join(presetDir, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(presetDir, 'agents', 'foo.md'),
      '# Foo\n\nKiroKit content with .kiro/ paths and Kiro references.\n',
    );
    expect(() =>
      run.checkRebrandLeak({ presets: ['frontend'], workspaceRoot: ws.root }),
    ).not.toThrow();
  });

  it('fail với E_REBRAND_LEAK khi gặp "ClaudeKit"', () => {
    const presetDir = path.join(ws.root, 'presets', 'frontend');
    fs.mkdirSync(path.join(presetDir, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(presetDir, 'agents', 'leaky.md'),
      '# Leaky\n\nThis is ClaudeKit branding.\n',
    );

    try {
      run.checkRebrandLeak({ presets: ['frontend'], workspaceRoot: ws.root });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('E_REBRAND_LEAK');
      expect(err.exitCode).toBe(6);
      expect(err.details).toHaveLength(1);
      expect(err.details[0].file).toBe('presets/frontend/agents/leaky.md');
      expect(err.details[0].lineNumber).toBe(3);
      expect(err.details[0].match).toBe('ClaudeKit');
    }
  });

  it('fail khi gặp ".claude/"', () => {
    const presetDir = path.join(ws.root, 'presets', 'backend');
    fs.mkdirSync(path.join(presetDir, 'workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(presetDir, 'workflows', 'flow.md'),
      'Configure .claude/settings.json for hooks.\n',
    );
    expect(() =>
      run.checkRebrandLeak({ presets: ['backend'], workspaceRoot: ws.root }),
    ).toThrow(/Rebrand-leak check failed/);
  });

  it('fail khi gặp "Claude Code"', () => {
    const presetDir = path.join(ws.root, 'presets', 'mobile');
    fs.mkdirSync(path.join(presetDir, 'commands'), { recursive: true });
    fs.writeFileSync(
      path.join(presetDir, 'commands', 'cmd.md'),
      'Run Claude Code in your terminal.\n',
    );
    expect(() =>
      run.checkRebrandLeak({ presets: ['mobile'], workspaceRoot: ws.root }),
    ).toThrow(/Rebrand-leak check failed/);
  });

  it('exception: skills/claude-code/ subtree không bị flag', () => {
    const presetDir = path.join(ws.root, 'presets', 'frontend');
    const claudeCodeDir = path.join(presetDir, 'skills', 'claude-code');
    fs.mkdirSync(claudeCodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeCodeDir, 'SKILL.md'),
      '# Claude Code Skill\n\nThis docs about Claude Code, ClaudeKit, .claude/ paths.\n',
    );
    expect(() =>
      run.checkRebrandLeak({ presets: ['frontend'], workspaceRoot: ws.root }),
    ).not.toThrow();
  });

  it('skip file có extension không trong scan list (.svg, .jpg)', () => {
    const presetDir = path.join(ws.root, 'presets', 'frontend');
    fs.mkdirSync(path.join(presetDir, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(presetDir, 'assets', 'logo.svg'),
      '<svg>ClaudeKit</svg>',
    );
    expect(() =>
      run.checkRebrandLeak({ presets: ['frontend'], workspaceRoot: ws.root }),
    ).not.toThrow();
  });

  it('details có lineNumber + match string đầy đủ', () => {
    const presetDir = path.join(ws.root, 'presets', 'devops');
    fs.mkdirSync(path.join(presetDir, 'commands'), { recursive: true });
    fs.writeFileSync(
      path.join(presetDir, 'commands', 'multi.md'),
      'line1\nline2 ClaudeKit\nline3 .claude/foo\nline4\n',
    );
    try {
      run.checkRebrandLeak({ presets: ['devops'], workspaceRoot: ws.root });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('E_REBRAND_LEAK');
      expect(err.details).toHaveLength(2);
      const lineNumbers = err.details.map((d) => d.lineNumber).sort();
      expect(lineNumbers).toEqual([2, 3]);
    }
  });
});

// ---------------------------------------------------------------------------
// exitCodeForError tests
// ---------------------------------------------------------------------------

describe('exitCodeForError', () => {
  it('E_INV_MISSING → 2', () => {
    expect(run.exitCodeForError({ code: 'E_INV_MISSING' })).toBe(2);
  });
  it('E_INV_SCHEMA → 2', () => {
    expect(run.exitCodeForError({ code: 'E_INV_SCHEMA' })).toBe(2);
  });
  it('E_WRITE_LOCK → 3', () => {
    expect(run.exitCodeForError({ code: 'E_WRITE_LOCK' })).toBe(3);
  });
  it('E_MANIFEST_INVALID → 4', () => {
    expect(run.exitCodeForError({ code: 'E_MANIFEST_INVALID' })).toBe(4);
  });
  it('E_MANIFEST_NO_ORPHAN → 4', () => {
    expect(run.exitCodeForError({ code: 'E_MANIFEST_NO_ORPHAN' })).toBe(4);
  });
  it('E_THRESHOLD_FAIL → 5', () => {
    expect(run.exitCodeForError({ code: 'E_THRESHOLD_FAIL' })).toBe(5);
  });
  it('E_REBRAND_LEAK → 6', () => {
    expect(run.exitCodeForError({ code: 'E_REBRAND_LEAK' })).toBe(6);
  });
  it('explicit exitCode wins over code', () => {
    expect(run.exitCodeForError({ code: 'E_INV_MISSING', exitCode: 99 })).toBe(99);
  });
  it('unknown code → default 2', () => {
    expect(run.exitCodeForError({ code: 'WEIRD' })).toBe(2);
  });
  it('null/undefined → default 2', () => {
    expect(run.exitCodeForError(null)).toBe(2);
    expect(run.exitCodeForError(undefined)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// countPresetArtifacts smoke
// ---------------------------------------------------------------------------

describe('countPresetArtifacts', () => {
  /** @type {{ root: string, cleanup: () => void }} */
  let ws;
  beforeEach(() => {
    ws = makeWorkspace();
  });
  afterEach(() => ws.cleanup());

  it('count đúng theo từng category', () => {
    scaffoldPreset(ws.root, 'frontend', {
      agents: 5,
      skills: 7,
      commands: 12,
      hooks: 3,
      workflows: 2,
    });
    const counts = run.countPresetArtifacts('frontend', ws.root);
    expect(counts).toEqual({
      agents: 5,
      skills: 7,
      commands: 12,
      hooks: 3,
      workflows: 2,
    });
  });

  it('preset chưa scaffold trả 0 cho mọi category', () => {
    const counts = run.countPresetArtifacts('mobile', ws.root);
    expect(counts).toEqual({
      agents: 0,
      skills: 0,
      commands: 0,
      hooks: 0,
      workflows: 0,
    });
  });

  it('countMdRecursive tính cả subdirs trong commands/', () => {
    const presetDir = path.join(ws.root, 'presets', 'backend');
    fs.mkdirSync(path.join(presetDir, 'commands', 'git'), { recursive: true });
    fs.mkdirSync(path.join(presetDir, 'commands', 'fix'), { recursive: true });
    fs.writeFileSync(path.join(presetDir, 'commands', 'top.md'), '#');
    fs.writeFileSync(path.join(presetDir, 'commands', 'git', 'cm.md'), '#');
    fs.writeFileSync(path.join(presetDir, 'commands', 'git', 'cp.md'), '#');
    fs.writeFileSync(path.join(presetDir, 'commands', 'fix', 'lint.md'), '#');
    expect(run.countPresetArtifacts('backend', ws.root).commands).toBe(4);
  });
});
