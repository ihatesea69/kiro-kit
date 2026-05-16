#!/usr/bin/env node
/**
 * _build-inventory-target.cjs
 *
 * Spec: claudekit-vs-kirokit-audit, Task 3.1
 * For each of the 7 presets under presets/, reads the corresponding
 * appendix/target-files-<preset>.txt listing, classifies each path
 * according to the prefix table in design.md, extracts metadata, parses
 * presets/<preset>/manifest.json, detects manifest mismatches, and
 * writes a single appendix/inventory-target.json keyed by preset.
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
  'claudekit-vs-kirokit',
  'appendix'
);
const INVENTORY_OUT = path.join(APPENDIX_DIR, 'inventory-target.json');
const RUN_LOG = path.join(APPENDIX_DIR, 'run.log');

const PRESETS = [
  '_template',
  'backend',
  'frontend',
  'fullstack',
  'mobile',
  'devops',
  'data-ai',
];

// ---------------------------------------------------------------------------
// Helpers (mirror source script)
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
// YAML front-matter parser (small subset, ported verbatim from source script)
// ---------------------------------------------------------------------------

const TARGET_FM_KEYS = new Set([
  'name',
  'description',
  'model',
  'inclusion',
  'tools',
  'argument-hint',
]);

function parseFrontMatter(filepath) {
  const head = readFirstLines(filepath, 80);
  if (head.length === 0) {
    return { present: false, fields: null };
  }
  if (head[0].trim() !== '---') {
    return { present: false, fields: null };
  }
  let endIdx = -1;
  for (let i = 1; i < head.length; i++) {
    if (head[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
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
      const stripped = trimmed.replace(/^['"]|['"]$/g, '');
      fields.tools = [stripped];
      i++;
      continue;
    }

    const trimmed = value.trim();

    if (trimmed === '>' || trimmed === '>-' || trimmed === '|' || trimmed === '|-') {
      const collected = [];
      let j = i + 1;
      while (j < endIdx) {
        const ln = head[j];
        if (ln.length === 0) {
          collected.push('');
          j++;
          continue;
        }
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
// Classification (target preset)
// ---------------------------------------------------------------------------

/**
 * Decide artifact_type for a path under presets/<preset>/. Returns null to
 * skip (e.g. .gitkeep placeholders, raw skill member files captured by the
 * skill folder entry).
 */
function classify(p, presetPrefix) {
  // Top-level files under presets/<preset>/
  if (p === `${presetPrefix}settings.json`) return 'settings';
  if (p === `${presetPrefix}manifest.json`) return 'metadata';
  if (p === `${presetPrefix}.mcp.json.example`) return 'mcp_template';
  if (p === `${presetPrefix}.env.example`) return 'env_example';
  if (p === `${presetPrefix}README.md`) return 'docs_template';
  if (
    p === `${presetPrefix}statusline.js` ||
    p === `${presetPrefix}statusline.sh` ||
    p === `${presetPrefix}statusline.ps1`
  ) {
    return 'statusline';
  }

  // agents/
  if (p.startsWith(`${presetPrefix}agents/`)) {
    if (p.endsWith('.gitkeep')) return null;
    if (p.endsWith('.md')) return 'agent';
    return null;
  }

  // commands/ (any nesting)
  if (p.startsWith(`${presetPrefix}commands/`)) {
    if (p.endsWith('.gitkeep')) return null;
    if (p.endsWith('.md')) return 'command';
    return null;
  }

  // workflows/
  if (p.startsWith(`${presetPrefix}workflows/`)) {
    if (p.endsWith('.md')) return 'workflow';
    return null;
  }

  // steering/  (target-only artifact_type)
  if (p.startsWith(`${presetPrefix}steering/`)) {
    if (p.endsWith('.gitkeep')) return null;
    if (p.endsWith('.md')) return 'steering';
    return null;
  }

  // hooks/
  if (p.startsWith(`${presetPrefix}hooks/`)) {
    if (p === `${presetPrefix}hooks/.env.example`) return 'env_example';
    if (p === `${presetPrefix}hooks/README.md`) return 'docs_template';
    if (p.endsWith('.md')) return 'docs_template';
    if (p.endsWith('.js') || p.endsWith('.sh') || p.endsWith('.ps1')) {
      return 'hook';
    }
    return null;
  }

  // skills/
  if (p.startsWith(`${presetPrefix}skills/`)) {
    if (p === `${presetPrefix}skills/.env.example`) return 'env_example';
    const after = p.slice(`${presetPrefix}skills/`.length);
    if (!after.includes('/')) {
      // single segment under skills/ — top-level docs (README.md,
      // INSTALLATION.md, THIRD_PARTY_NOTICES.md, agent_skills_spec.md)
      if (after.endsWith('.md')) return 'docs_template';
      return null;
    }
    return 'skill_member';
  }

  // specs/_templates/
  if (p.startsWith(`${presetPrefix}specs/_templates/`)) {
    if (p.endsWith('.gitkeep')) return null;
    if (p.endsWith('.md')) return 'spec_template';
    return null;
  }

  // docs/
  if (p.startsWith(`${presetPrefix}docs/`)) {
    if (p.endsWith('.gitkeep')) return null;
    if (p.endsWith('.md')) return 'docs_template';
    return null;
  }

  // anything else under preset → skip
  return null;
}

// ---------------------------------------------------------------------------
// Skill folder discovery (per preset)
// ---------------------------------------------------------------------------

function buildSkillFolders(allPaths, presetPrefix) {
  const skillsPrefix = `${presetPrefix}skills/`;
  const skillMembers = allPaths.filter(
    (p) =>
      p.startsWith(skillsPrefix) &&
      p !== `${skillsPrefix}.env.example` &&
      p.slice(skillsPrefix.length).includes('/')
  );

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

    const directSkillMd = members.find((m) => {
      const tail = m.slice(folderPath.length);
      return /^SKILL\.md$/i.test(tail) || /^skill\.md$/i.test(tail);
    });

    const subdirSet = new Set();
    for (const m of members) {
      const tail = m.slice(folderPath.length);
      const seg = tail.split('/');
      if (seg.length >= 2) subdirSet.add(seg[0]);
    }
    const subdirs = Array.from(subdirSet).sort();

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
// Manifest parsing & mismatch detection
// ---------------------------------------------------------------------------

function loadManifest(presetPrefix) {
  const manifestPath = `${presetPrefix}manifest.json`;
  if (!fs.existsSync(manifestPath)) {
    return { manifest: null, manifestPath, parseError: 'missing' };
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const data = JSON.parse(raw);
    return { manifest: data, manifestPath, parseError: null };
  } catch (err) {
    return {
      manifest: null,
      manifestPath,
      parseError: `parse-error: ${err.message}`,
    };
  }
}

/**
 * Compare `manifest.files[].source` (relative to preset root) against the
 * actual file listing under presets/<preset>/. Returns two arrays:
 *   - dangling: manifest entries whose target file does NOT exist on disk
 *   - missing_entry: on-disk files of audited artifact types that are NOT
 *                    declared in manifest.files
 * Both are recorded as objects {type, path}.
 */
function detectManifestMismatches(manifest, allPaths, entries, presetPrefix) {
  const mismatches = [];

  const onDiskSet = new Set(allPaths);
  const manifestFiles =
    manifest && Array.isArray(manifest.files) ? manifest.files : [];

  // 1) manifest entries whose source file does not exist on disk
  const manifestSourcePaths = new Set();
  for (const f of manifestFiles) {
    if (!f || typeof f.source !== 'string') continue;
    const fullPath = `${presetPrefix}${f.source}`;
    manifestSourcePaths.add(fullPath);
    if (!onDiskSet.has(fullPath)) {
      mismatches.push({ type: 'manifest_dangling', path: fullPath });
    }
  }

  // 2) on-disk files that should be in the manifest but aren't.
  // Audited artifact types per Requirement 3.4: anything that contributes a
  // user-visible artifact. We use the `entries` array (already classified),
  // excluding non-installable types: `metadata` (the manifest itself) and
  // `docs_template` files NOT explicitly listed in manifest (manifest only
  // tracks a subset of docs as `type:doc`).
  //
  // Strategy: for every entry (except `metadata` for the manifest itself),
  // compare its path. For skill folders we use the SKILL.md path (skillMd)
  // to align with manifest convention `skills/<name>/SKILL.md`. For
  // Sub_Skill_Container without root SKILL.md we use the per-subdir SKILL.md
  // entries — but those will be captured separately below by walking
  // skill members.
  const expectedInManifest = new Set();
  for (const e of entries) {
    // skip the manifest itself
    if (e.artifact_type === 'metadata') continue;
    // skip docs_template that are presetPrefix README (not in manifest)
    if (
      e.artifact_type === 'docs_template' &&
      e.path === `${presetPrefix}README.md`
    ) {
      continue;
    }
    if (e.artifact_type === 'skill') {
      // Manifest convention: skills/<name>/SKILL.md is the authoritative
      // entry for a skill. For Sub_Skill_Container (no root SKILL.md), the
      // manifest lists each sub-SKILL.md instead; we check those via the
      // separate sub-skill scan below and skip the container folder path
      // itself (it's a directory, not a file, so it can't be a "missing
      // entry" per Requirement 3.4 wording).
      if (e.extras && e.extras.skill_md_path) {
        expectedInManifest.add(e.extras.skill_md_path);
      }
      continue;
    }
    expectedInManifest.add(e.path);
  }

  // Also include sub-skill SKILL.md paths from disk (e.g.
  // skills/document-skills/docx/SKILL.md) so we can flag them if not in the
  // manifest — manifests for data-ai do include these explicitly.
  for (const p of allPaths) {
    if (!p.startsWith(`${presetPrefix}skills/`)) continue;
    const tail = p.slice(`${presetPrefix}skills/`.length);
    if (/^[^/]+\/[^/]+\/SKILL\.md$/i.test(tail)) {
      expectedInManifest.add(p);
    }
  }

  for (const expected of expectedInManifest) {
    if (!manifestSourcePaths.has(expected)) {
      mismatches.push({ type: 'manifest_missing_entry', path: expected });
    }
  }

  // Stable sort for determinism
  mismatches.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.path.localeCompare(b.path);
  });

  return mismatches;
}

// ---------------------------------------------------------------------------
// Build inventory for one preset
// ---------------------------------------------------------------------------

function buildPresetInventory(preset) {
  const presetPrefix = `presets/${preset}/`;
  const listingPath = path.join(
    APPENDIX_DIR,
    `target-files-${preset}.txt`
  );
  if (!fs.existsSync(listingPath)) {
    throw new Error(`Missing listing: ${listingPath}`);
  }

  const allPaths = readLines(listingPath).map((p) => pathPosix(p));

  const skillFolders = buildSkillFolders(allPaths, presetPrefix);

  const hookFiles = allPaths.filter(
    (p) =>
      p.startsWith(`${presetPrefix}hooks/`) &&
      (p.endsWith('.js') || p.endsWith('.sh') || p.endsWith('.ps1'))
  );
  const hookGroups = buildHookGroups(hookFiles);

  const entries = [];

  // Skill entries
  for (const folder of skillFolders) {
    const sizeLines = folder.skillMdPath ? countLines(folder.skillMdPath) : 0;
    entries.push({
      id: `tgt.${preset}.skill.${folder.name}`,
      kit: 'target',
      preset,
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

  // Per-file classification
  for (const p of allPaths) {
    const type = classify(p, presetPrefix);
    if (!type) continue;
    if (type === 'skill_member') continue;

    const base = basenameNoExt(p);
    const sizeLines = countLines(p);

    let frontMatter = { present: false, fields: null };
    if (
      type === 'agent' ||
      type === 'command' ||
      type === 'workflow' ||
      type === 'steering' ||
      type === 'spec_template' ||
      type === 'docs_template'
    ) {
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

    let id;
    if (type === 'command') {
      const slug = p
        .slice(`${presetPrefix}commands/`.length)
        .replace(/\.md$/, '')
        .replace(/\//g, '__');
      id = `tgt.${preset}.command.${slug}`;
    } else if (type === 'hook') {
      const ext = path.extname(p).slice(1);
      id = `tgt.${preset}.hook.${base}.${ext}`;
    } else if (type === 'statusline') {
      const ext = path.extname(p).slice(1);
      id = `tgt.${preset}.statusline.${ext}`;
    } else if (type === 'docs_template') {
      let slugBase;
      if (p === `${presetPrefix}README.md`) {
        slugBase = 'preset_readme';
      } else if (p.startsWith(`${presetPrefix}docs/`)) {
        slugBase = `docs__${p
          .slice(`${presetPrefix}docs/`.length)
          .replace(/\.md$/, '')
          .replace(/\//g, '__')}`;
      } else if (p.startsWith(`${presetPrefix}hooks/`)) {
        slugBase = `hooks__${base}`;
      } else if (p.startsWith(`${presetPrefix}skills/`)) {
        slugBase = `skills__${base}`;
      } else {
        slugBase = base;
      }
      id = `tgt.${preset}.docs_template.${slugBase}`;
    } else if (type === 'env_example') {
      let suffix = 'preset';
      if (p === `${presetPrefix}hooks/.env.example`) suffix = 'hooks';
      else if (p === `${presetPrefix}skills/.env.example`) suffix = 'skills';
      id = `tgt.${preset}.env_example.${suffix}`;
    } else if (type === 'spec_template') {
      const slug = p
        .slice(`${presetPrefix}specs/_templates/`.length)
        .replace(/\.md$/, '')
        .replace(/\//g, '__');
      id = `tgt.${preset}.spec_template.${slug}`;
    } else if (type === 'workflow' || type === 'steering' || type === 'agent') {
      id = `tgt.${preset}.${type}.${base}`;
    } else {
      id = `tgt.${preset}.${type}.${base}`;
    }

    entries.push({
      id,
      kit: 'target',
      preset,
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

  // Stable sort
  entries.sort((a, b) => {
    if (a.artifact_type !== b.artifact_type) {
      return a.artifact_type.localeCompare(b.artifact_type);
    }
    return a.path.localeCompare(b.path);
  });

  // Manifest
  const { manifest, manifestPath, parseError } = loadManifest(presetPrefix);

  let manifestSummary = null;
  if (manifest) {
    manifestSummary = {
      path: manifestPath,
      files_count: Array.isArray(manifest.files) ? manifest.files.length : 0,
      minCounts: manifest.minCounts || null,
      mcpServers: manifest.mcpServers
        ? Object.keys(manifest.mcpServers).sort()
        : [],
      hooks: manifest.hooks || null,
    };
  } else {
    manifestSummary = {
      path: manifestPath,
      files_count: 0,
      minCounts: null,
      mcpServers: [],
      hooks: null,
      parse_error: parseError,
    };
  }

  // Manifest mismatches
  const mismatches =
    manifest && !parseError
      ? detectManifestMismatches(manifest, allPaths, entries, presetPrefix)
      : [];

  // Counts per artifact_type
  const counts = {};
  for (const e of entries) {
    counts[e.artifact_type] = (counts[e.artifact_type] || 0) + 1;
  }

  return {
    preset,
    manifest: manifestSummary,
    manifest_mismatches: mismatches,
    counts,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const result = {};
  const summaryPerPreset = {};

  for (const preset of PRESETS) {
    const data = buildPresetInventory(preset);
    result[preset] = {
      manifest: data.manifest,
      manifest_mismatches: data.manifest_mismatches,
      entries: data.entries,
    };
    summaryPerPreset[preset] = {
      total: data.entries.length,
      counts: data.counts,
      manifest_files_count: data.manifest ? data.manifest.files_count : 0,
      manifest_mismatch_count: data.manifest_mismatches.length,
    };
  }

  fs.writeFileSync(INVENTORY_OUT, JSON.stringify(result, null, 2) + '\n');

  // Append run.log
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const presetCounts = PRESETS.map(
    (p) => `${p}=${summaryPerPreset[p].total}`
  ).join(', ');
  const totalEntries = PRESETS.reduce(
    (acc, p) => acc + summaryPerPreset[p].total,
    0
  );
  const logLine = `${ts} INFO inventory target_inventory_total=${totalEntries} (${presetCounts})\n`;
  fs.appendFileSync(RUN_LOG, logLine);

  console.log(
    JSON.stringify(
      {
        total_entries: totalEntries,
        per_preset: summaryPerPreset,
        output: INVENTORY_OUT,
      },
      null,
      2
    )
  );
}

main();
