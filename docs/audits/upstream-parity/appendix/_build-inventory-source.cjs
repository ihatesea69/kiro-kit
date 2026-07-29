#!/usr/bin/env node
/**
 * _build-inventory-source.cjs
 *
 * Spec: upstream-parity-audit, Task 2.1
 * Reads appendix/source-files.txt, classifies each path according to
 * the prefix table in design.md, extracts metadata for each artifact,
 * and writes appendix/inventory-source.json.
 *
 * Pure CommonJS, no external dependencies. Cross-platform (LF/CRLF safe).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const APPENDIX_DIR = path.join(
  'docs',
  'audits',
  'upstream-parity',
  'appendix'
);
const SOURCE_FILES_TXT = path.join(APPENDIX_DIR, 'source-files.txt');
const INVENTORY_OUT = path.join(APPENDIX_DIR, 'inventory-source.json');
const RUN_LOG = path.join(APPENDIX_DIR, 'run.log');

const SOURCE_ROOT = 'the-upstream-kit';
const CLAUDE_PREFIX = `${SOURCE_ROOT}/.claude/`;
const DOCS_PREFIX = `${SOURCE_ROOT}/docs/`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readLines(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function countLines(filepath) {
  if (!fs.existsSync(filepath)) return 0;
  const raw = fs.readFileSync(filepath, 'utf8');
  if (raw.length === 0) return 0;
  // count line breaks; if file does not end with a newline, count remainder
  const matches = raw.match(/\r?\n/g);
  let n = matches ? matches.length : 0;
  if (!raw.endsWith('\n') && !raw.endsWith('\r')) n += 1;
  return n;
}

function readFirstLines(filepath, limit) {
  if (!fs.existsSync(filepath)) return [];
  const raw = fs.readFileSync(filepath, 'utf8');
  const lines = raw.split(/\r?\n/);
  return lines.slice(0, limit);
}

function pathPosix(p) {
  return p.split(path.sep).join('/');
}

function basenameNoExt(p) {
  const base = path.basename(p);
  const ext = path.extname(base);
  if (!ext) return base;
  return base.slice(0, -ext.length);
}

// ---------------------------------------------------------------------------
// YAML front-matter parser (very small subset)
// ---------------------------------------------------------------------------

const TARGET_FM_KEYS = new Set([
  'name',
  'description',
  'model',
  'inclusion',
  'tools',
  'argument-hint',
]);

/**
 * Parse the YAML front-matter at the very top of a file (read enough lines
 * to capture even unusually-long front-matter blocks; some agents use folded
 * scalars or example blocks that push the closing fence past line 30).
 * Returns { present, fields } where fields is null when malformed/absent.
 *
 * Supports:
 * - Simple key: value pairs (string values, possibly quoted)
 * - Folded/literal scalar markers (>, >-, |, |-) — captured as "<folded>"
 * - tools as inline array: [a, b, c]
 * - tools as block list under `tools:` line with subsequent `  - x` lines
 */
function parseFrontMatter(filepath) {
  const head = readFirstLines(filepath, 80);
  if (head.length === 0) {
    return { present: false, fields: null };
  }
  if (head[0].trim() !== '---') {
    return { present: false, fields: null };
  }
  // find closing fence
  let endIdx = -1;
  for (let i = 1; i < head.length; i++) {
    if (head[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    // unterminated block within first 30 lines -> treat as malformed
    return { present: true, fields: null };
  }

  const fields = {};
  for (const key of TARGET_FM_KEYS) fields[key] = null;

  let i = 1;
  while (i < endIdx) {
    const rawLine = head[i];
    const line = rawLine.replace(/\s+$/g, '');
    if (line.length === 0) {
      i++;
      continue;
    }
    // top-level key: value
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    let value = m[2];
    if (!TARGET_FM_KEYS.has(key)) {
      i++;
      continue;
    }
    if (key === 'tools') {
      // inline array form: [a, b, c]
      const trimmed = value.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const inner = trimmed.slice(1, -1).trim();
        if (inner.length === 0) {
          fields.tools = [];
        } else {
          fields.tools = inner
            .split(',')
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter((s) => s.length > 0);
        }
        i++;
        continue;
      }
      // block list form
      if (trimmed.length === 0) {
        const list = [];
        let j = i + 1;
        while (j < endIdx) {
          const ln = head[j];
          const lm = ln.match(/^\s*-\s*(.+)$/);
          if (!lm) break;
          let item = lm[1].trim();
          item = item.replace(/^['"]|['"]$/g, '');
          list.push(item);
          j++;
        }
        fields.tools = list;
        i = j;
        continue;
      }
      // single string value (rare): treat as one-element array
      const stripped = trimmed.replace(/^['"]|['"]$/g, '');
      fields.tools = [stripped];
      i++;
      continue;
    }

    // simple scalar — possibly a folded/literal scalar marker
    const trimmed = value.trim();

    if (trimmed === '>' || trimmed === '>-' || trimmed === '|' || trimmed === '|-') {
      // folded/literal block: collect subsequent indented lines until a
      // top-level key reappears or we hit the closing fence.
      const collected = [];
      let j = i + 1;
      while (j < endIdx) {
        const ln = head[j];
        if (ln.length === 0) {
          collected.push('');
          j++;
          continue;
        }
        // a top-level key would be a non-indented "<word>:" line
        if (/^[A-Za-z][A-Za-z0-9_-]*\s*:/.test(ln)) break;
        collected.push(ln.replace(/^\s+/, ''));
        j++;
      }
      const folded = collected.join(' ').trim();
      fields[key] = folded.length > 0 ? folded : null;
      i = j;
      continue;
    }

    const stripped = trimmed.replace(/^['"]|['"]$/g, '');
    fields[key] = stripped.length > 0 ? stripped : null;
    i++;
  }

  return { present: true, fields };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Decide the artifact_type for a Source_Kit path. Returns null when the path
 * should be skipped (out of audit scope: .opencode/, scripts/, tests/, root
 * docs like LICENSE/CHANGELOG/CLAUDE.md/GEMINI.md/README.md, package.json,
 * etc.).
 */
function classify(p) {
  // settings, metadata, mcp, env, statusline (top-level under .claude/)
  if (p === `${CLAUDE_PREFIX}settings.json`) return 'settings';
  if (p === `${CLAUDE_PREFIX}metadata.json`) return 'metadata';
  if (p === `${CLAUDE_PREFIX}.mcp.json.example`) return 'mcp_template';
  if (p === `${CLAUDE_PREFIX}.env.example`) return 'env_example';
  if (p === `${CLAUDE_PREFIX}.gitignore`) return null; // skip
  if (
    p === `${CLAUDE_PREFIX}statusline.js` ||
    p === `${CLAUDE_PREFIX}statusline.sh` ||
    p === `${CLAUDE_PREFIX}statusline.ps1`
  ) {
    return 'statusline';
  }

  // agents
  if (p.startsWith(`${CLAUDE_PREFIX}agents/`) && p.endsWith('.md')) {
    return 'agent';
  }

  // commands (any nesting depth)
  if (p.startsWith(`${CLAUDE_PREFIX}commands/`) && p.endsWith('.md')) {
    return 'command';
  }

  // workflows
  if (p.startsWith(`${CLAUDE_PREFIX}workflows/`) && p.endsWith('.md')) {
    return 'workflow';
  }

  // hooks
  if (p.startsWith(`${CLAUDE_PREFIX}hooks/`)) {
    if (p === `${CLAUDE_PREFIX}hooks/.env.example`) return 'env_example';
    if (p.endsWith('.md')) return 'docs_template';
    if (p.endsWith('.js') || p.endsWith('.sh') || p.endsWith('.ps1')) {
      return 'hook';
    }
    return null;
  }

  // skills
  if (p.startsWith(`${CLAUDE_PREFIX}skills/`)) {
    // env example sibling at skills root
    if (p === `${CLAUDE_PREFIX}skills/.env.example`) return 'env_example';
    // top-level docs at skills root (not inside any skill folder)
    const after = p.slice(`${CLAUDE_PREFIX}skills/`.length);
    if (!after.includes('/')) {
      // single segment under skills/ — these are top-level docs files like
      // agent_skills_spec.md, INSTALLATION.md, README.md, THIRD_PARTY_NOTICES.md
      if (after.endsWith('.md')) return 'docs_template';
      return null;
    }
    // belongs to a skill folder; the skill entry itself is built separately
    return 'skill_member';
  }

  // docs templates under the-upstream-kit/docs/
  if (p.startsWith(DOCS_PREFIX) && p.endsWith('.md')) {
    return 'docs_template';
  }

  // everything else (.opencode/, scripts/, tests/, root LICENSE etc.) → skip
  return null;
}

// ---------------------------------------------------------------------------
// Skill folder discovery
// ---------------------------------------------------------------------------

/**
 * Build the list of skill folder roots from all skill-member paths.
 * A skill folder root is the directory immediately under .claude/skills/.
 * Special case: document-skills/ has no SKILL.md at its root but contains
 * sub-skills (docx, pdf, pptx, xlsx) each with their own SKILL.md → treat
 * document-skills/ as Sub_Skill_Container.
 */
function buildSkillFolders(allPaths) {
  const skillsPrefix = `${CLAUDE_PREFIX}skills/`;
  const skillMembers = allPaths.filter(
    (p) =>
      p.startsWith(skillsPrefix) &&
      p !== `${skillsPrefix}.env.example` &&
      p.slice(skillsPrefix.length).includes('/')
  );

  // Group by top-level skill folder name (segment after skills/)
  const byRoot = new Map();
  for (const p of skillMembers) {
    const tail = p.slice(skillsPrefix.length);
    const root = tail.split('/')[0];
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(p);
  }

  const folders = [];
  for (const [name, members] of byRoot.entries()) {
    const folderPath = `${skillsPrefix}${name}/`;

    // direct SKILL.md (case-insensitive)
    const directSkillMd = members.find((m) => {
      const tail = m.slice(folderPath.length);
      return /^SKILL\.md$/i.test(tail) || /^skill\.md$/i.test(tail);
    });

    // detect immediate subdirectories (segments right after the folder)
    const subdirSet = new Set();
    for (const m of members) {
      const tail = m.slice(folderPath.length);
      const seg = tail.split('/');
      if (seg.length >= 2) subdirSet.add(seg[0]);
    }
    const subdirs = Array.from(subdirSet).sort();

    // Sub_Skill_Container detection: no direct SKILL.md AND >= 2 subdirs
    // each containing their own SKILL.md (case-insensitive at any depth in
    // their sub-tree directly below the subdir, i.e. <subdir>/SKILL.md)
    let isSubSkillContainer = false;
    if (!directSkillMd) {
      let withSkillMd = 0;
      for (const sub of subdirs) {
        const candidate = `${folderPath}${sub}/`;
        const hasSkillMd = members.some((m) => {
          if (!m.startsWith(candidate)) return false;
          const remainder = m.slice(candidate.length);
          return /^SKILL\.md$/i.test(remainder) || /^skill\.md$/i.test(remainder);
        });
        if (hasSkillMd) withSkillMd++;
      }
      if (withSkillMd >= 2) isSubSkillContainer = true;
    }

    folders.push({
      name,
      path: folderPath,
      skillMdPath: directSkillMd || null,
      subdirs,
      isSubSkillContainer,
    });
  }

  // sort by name for determinism
  folders.sort((a, b) => a.name.localeCompare(b.name));
  return folders;
}

// ---------------------------------------------------------------------------
// Cross-platform triple detection (hooks)
// ---------------------------------------------------------------------------

const HOOK_EXTS = new Set(['.js', '.sh', '.ps1']);

function buildHookGroups(hookPaths) {
  const groups = new Map();
  for (const p of hookPaths) {
    const ext = path.extname(p);
    if (!HOOK_EXTS.has(ext)) continue;
    const base = basenameNoExt(p);
    if (!groups.has(base)) groups.set(base, new Set());
    groups.get(base).add(ext);
  }
  return groups;
}

function crossPlatformGroupOf(p, groups) {
  const ext = path.extname(p);
  if (!HOOK_EXTS.has(ext)) return null;
  const base = basenameNoExt(p);
  const exts = groups.get(base);
  if (!exts) return null;
  if (exts.has('.js') && exts.has('.sh') && exts.has('.ps1')) return base;
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(SOURCE_FILES_TXT)) {
    console.error(`Missing input file: ${SOURCE_FILES_TXT}`);
    process.exit(1);
  }

  const allPaths = readLines(SOURCE_FILES_TXT).map((p) => pathPosix(p));

  const skillFolders = buildSkillFolders(allPaths);

  // hook groups for triple detection
  const hookFiles = allPaths.filter(
    (p) =>
      p.startsWith(`${CLAUDE_PREFIX}hooks/`) &&
      (p.endsWith('.js') || p.endsWith('.sh') || p.endsWith('.ps1'))
  );
  const hookGroups = buildHookGroups(hookFiles);

  const entries = [];

  // Skill entries: one per skill folder root (skip the special root files)
  for (const folder of skillFolders) {
    const sizeLines = folder.skillMdPath ? countLines(folder.skillMdPath) : 0;
    entries.push({
      id: `src.skill.${folder.name}`,
      kit: 'source',
      preset: null,
      artifact_type: 'skill',
      path: folder.path,
      basename: folder.name,
      size_lines: sizeLines,
      front_matter: { present: false, fields: null },
      extras: {
        is_sub_skill_container: folder.isSubSkillContainer,
        subdirs: folder.subdirs,
        cross_platform_group: null,
        skill_md_path: folder.skillMdPath,
      },
    });
  }

  // Per-file classification for everything else
  for (const p of allPaths) {
    const type = classify(p);
    if (!type) continue;
    if (type === 'skill_member') continue; // rolled into skill entry above

    const base = basenameNoExt(p);
    const sizeLines = countLines(p);

    let frontMatter = { present: false, fields: null };
    if (
      type === 'agent' ||
      type === 'command' ||
      type === 'workflow' ||
      type === 'docs_template'
    ) {
      // workflows and docs_templates may or may not have front-matter; parse
      // anyway so the schema is consistent and downstream checks can run.
      try {
        frontMatter = parseFrontMatter(p);
      } catch (_err) {
        frontMatter = { present: true, fields: null };
      }
    }

    let crossGroup = null;
    if (type === 'hook') {
      crossGroup = crossPlatformGroupOf(p, hookGroups);
    }

    // ID generation: include slug/disambiguator when basename is not unique
    // (commands/hooks can collide). For commands, prefer the slug derived
    // from the path under .claude/commands/, e.g. fix/ci.
    let id;
    if (type === 'command') {
      const slug = p
        .slice(`${CLAUDE_PREFIX}commands/`.length)
        .replace(/\.md$/, '')
        .replace(/\//g, '__');
      id = `src.command.${slug}`;
    } else if (type === 'hook') {
      const ext = path.extname(p).slice(1); // js / sh / ps1
      id = `src.hook.${base}.${ext}`;
    } else if (type === 'statusline') {
      const ext = path.extname(p).slice(1);
      id = `src.statusline.${ext}`;
    } else if (type === 'docs_template') {
      const slugBase = p.startsWith(DOCS_PREFIX)
        ? `docs__${p.slice(DOCS_PREFIX.length).replace(/\.md$/, '').replace(/\//g, '__')}`
        : p.startsWith(`${CLAUDE_PREFIX}hooks/`)
          ? `hooks__${base}`
          : p.startsWith(`${CLAUDE_PREFIX}skills/`)
            ? `skills__${base}`
            : base;
      id = `src.docs_template.${slugBase}`;
    } else if (type === 'env_example') {
      // disambiguate by directory: .claude/.env.example vs hooks/.env.example
      let suffix = 'claude';
      if (p === `${CLAUDE_PREFIX}hooks/.env.example`) suffix = 'hooks';
      else if (p === `${CLAUDE_PREFIX}skills/.env.example`) suffix = 'skills';
      id = `src.env_example.${suffix}`;
    } else {
      id = `src.${type}.${base}`;
    }

    entries.push({
      id,
      kit: 'source',
      preset: null,
      artifact_type: type,
      path: p,
      basename: base,
      size_lines: sizeLines,
      front_matter: frontMatter,
      extras: {
        is_sub_skill_container: false,
        subdirs: [],
        cross_platform_group: crossGroup,
      },
    });
  }

  // Stable sort: by artifact_type, then path
  entries.sort((a, b) => {
    if (a.artifact_type !== b.artifact_type) {
      return a.artifact_type.localeCompare(b.artifact_type);
    }
    return a.path.localeCompare(b.path);
  });

  // Write output
  fs.writeFileSync(INVENTORY_OUT, JSON.stringify(entries, null, 2) + '\n');

  // Counts per artifact_type
  const counts = {};
  for (const e of entries) {
    counts[e.artifact_type] = (counts[e.artifact_type] || 0) + 1;
  }

  // Append run.log
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const countsStr = Object.keys(counts)
    .sort()
    .map((k) => `${k}=${counts[k]}`)
    .join(',');
  const logLine = `${ts} INFO inventory source_inventory_count=${entries.length} (${countsStr})\n`;
  fs.appendFileSync(RUN_LOG, logLine);

  // Stdout summary
  const summary = {
    total: entries.length,
    counts,
    output: INVENTORY_OUT,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
