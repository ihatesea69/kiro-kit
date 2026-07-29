#!/usr/bin/env node
/**
 * Generate the docs reference section from the repository itself.
 *
 *   presets/<preset>/manifest.json  ->  apps/docs/content/docs/reference/**
 *
 * Nothing in the reference section is hand-authored. Every catalog and every
 * number on every page is derived from the preset manifests and the files they
 * declare, so the published docs cannot drift away from what actually ships.
 *
 * The script fails with a non-zero exit if anything would render as a blank or
 * guessed value: a declared file missing from disk, a command/agent/skill with
 * no frontmatter description, or a manifest description whose embedded counts
 * disagree with the files on disk. A loud failure is the point -- the last two
 * count-drift bugs in this repo shipped precisely because a stale number looked
 * fine on the page.
 *
 * Zero dependencies. Wired as `predocs:build` / `predocs:dev`.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const presetsDir = path.join(repoRoot, 'presets');
const outDir = path.join(repoRoot, 'apps', 'docs', 'content', 'docs', 'reference');
const thresholdsTest = path.join(
  repoRoot,
  'packages',
  'cli',
  'tests',
  'structural',
  'preset-thresholds.test.ts',
);

const GITHUB = 'https://github.com/ihatesea69/kiro-kit/blob/main';
const GENERATED_BY = 'scripts/generate-docs-reference.mjs';

/**
 * Collected failures. We report all of them at once rather than dying on the
 * first, and de-duplicate because a single broken file can trip more than one
 * check (e.g. the per-artifact read and the whole-manifest existence sweep).
 */
const errors = new Set();
const fail = (message) => errors.add(message);

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Minimal YAML frontmatter reader. Deliberately not a YAML dependency -- this
 * mirrors the approach in packages/cli/tests/structural/frontmatter-validation.test.ts,
 * extended to handle the folded (`>-`) and literal (`|`) block scalars that
 * skill manifests use for `description`.
 *
 * @returns {Record<string, string> | null}
 */
function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  /** @type {Record<string, string>} */
  const fm = {};
  for (let i = 1; i < end; i += 1) {
    const match = lines[i].match(/^([A-Za-z_][\w-]*):[ \t]*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    // Block scalar: `>-`, `>`, `|`, `|-` etc. Consume the indented lines below.
    if (/^[>|][-+]?$/.test(value)) {
      const folded = value.startsWith('>');
      /** @type {string[]} */
      const block = [];
      let j = i + 1;
      for (; j < end; j += 1) {
        const line = lines[j];
        if (line.trim() === '') {
          block.push('');
          continue;
        }
        if (!/^\s/.test(line)) break;
        block.push(line.trim());
      }
      i = j - 1;
      value = folded ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
    } else {
      value = unquote(value);
    }

    fm[key] = value;
  }
  return fm;
}

function unquote(value) {
  if (value.length >= 2 && value[0] === '"' && value.at(-1) === '"') {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  if (value.length >= 2 && value[0] === "'" && value.at(-1) === "'") {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

// ---------------------------------------------------------------------------
// MDX escaping
// ---------------------------------------------------------------------------

/** Escape text for use inside an MDX table cell. */
function cell(text) {
  return String(text)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\|/g, '\\|')
    .trim();
}

/** Escape text for use in MDX prose (no table pipe escaping). */
function prose(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .trim();
}

// Spec folder slugs are lowercase, so plain title-casing turns "mcp" into "Mcp".
// Keep the acronyms that appear in preset spec names readable.
const ACRONYMS = new Set([
  'api',
  'aws',
  'cd',
  'cdk',
  'ci',
  'cli',
  'dr',
  'llm',
  'mcp',
  'rag',
  'sdk',
  'ui',
]);

/** Product names whose casing is neither lowercase nor a plain acronym. */
const WORD_CASE = new Map([['agentcore', 'AgentCore']]);

/** `example-api-key-authentication` -> `API Key Authentication` */
function titleize(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => {
      if (WORD_CASE.has(word)) return WORD_CASE.get(word);
      if (ACRONYMS.has(word)) return word.toUpperCase();
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/** Quote a scalar for YAML frontmatter. */
function yamlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

// NOTE: an MDX comment is a JS block comment, so the banner text must never
// contain the sequence that closes one. Write `presets/<name>/manifest.json`,
// not the glob form.
const banner = `{/* GENERATED FILE -- do not edit.\n    Produced by ${GENERATED_BY} from presets/<name>/manifest.json.\n    Edit the preset instead, then re-run the docs build. */}`;

// ---------------------------------------------------------------------------
// Preset loading
// ---------------------------------------------------------------------------

/**
 * Read one file's frontmatter, recording an error if the file is missing or the
 * required fields are absent.
 *
 * @returns {Record<string,string>} possibly empty; callers must check `errors`
 */
async function frontmatterOf(absPath, relLabel, required) {
  if (!existsSync(absPath)) {
    fail(`${relLabel}: declared in manifest.json but missing on disk`);
    return {};
  }
  const fm = parseFrontmatter(await readFile(absPath, 'utf8'));
  if (!fm) {
    fail(`${relLabel}: no YAML frontmatter block`);
    return {};
  }
  for (const key of required) {
    if (!fm[key]) fail(`${relLabel}: frontmatter is missing \`${key}\``);
  }
  return fm;
}

async function loadPreset(name) {
  const dir = path.join(presetsDir, name);
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  const files = manifest.files ?? [];

  const srcOf = (file) => path.join(dir, file.source);
  const linkOf = (file) => `${GITHUB}/presets/${name}/${file.source}`;

  // --- commands -----------------------------------------------------------
  const commands = [];
  for (const file of files.filter((f) => f.type === 'command' && f.source.endsWith('.md'))) {
    const rel = `presets/${name}/${file.source}`;
    const fm = await frontmatterOf(srcOf(file), rel, ['description']);
    commands.push({
      id: file.source.replace(/^commands\//, '').replace(/\.md$/, ''),
      description: fm.description ?? '',
      link: linkOf(file),
    });
  }

  // --- agents -------------------------------------------------------------
  const agents = [];
  for (const file of files.filter((f) => f.type === 'agent' && f.source.endsWith('.md'))) {
    const rel = `presets/${name}/${file.source}`;
    const fm = await frontmatterOf(srcOf(file), rel, ['name', 'description']);
    agents.push({
      id: fm.name ?? path.basename(file.source, '.md'),
      description: fm.description ?? '',
      link: linkOf(file),
    });
  }

  // --- skills -------------------------------------------------------------
  // A skill is a folder; its SKILL.md carries the name and description.
  const skills = [];
  for (const file of files.filter((f) => f.type === 'skill' && /(^|\/)SKILL\.md$/.test(f.source))) {
    const rel = `presets/${name}/${file.source}`;
    const fm = await frontmatterOf(srcOf(file), rel, ['name', 'description']);
    skills.push({
      id: fm.name ?? path.basename(path.dirname(file.source)),
      description: fm.description ?? '',
      link: linkOf(file),
    });
  }

  // --- workflows, specs, hook files ---------------------------------------
  const workflows = files
    .filter((f) => f.type === 'workflow' && f.source.endsWith('.md'))
    .map((f) => ({ id: path.basename(f.source, '.md'), link: linkOf(f) }));

  // Worked example specs ship as `specs/example-<feature>/{requirements,design,tasks}.md`.
  // List one entry per feature rather than one per file.
  const exampleSpecs = [
    ...new Set(
      files
        .filter((f) => f.type === 'spec' && f.source.startsWith('specs/example-'))
        .map((f) => f.source.split('/')[1]),
    ),
  ].map((folder) => ({
    id: folder.replace(/^example-/, ''),
    title: titleize(folder.replace(/^example-/, '')),
    link: `${GITHUB}/presets/${name}/specs/${folder}`,
  }));

  // --- Kiro Powers ---------------------------------------------------------
  const powersFile = files.find((f) => f.type === 'powers');
  let powers = [];
  if (powersFile) {
    const abs = srcOf(powersFile);
    if (existsSync(abs)) {
      try {
        const parsed = JSON.parse(await readFile(abs, 'utf8'));
        powers = (parsed.powers ?? []).map((p) => ({
          name: p.name ?? '',
          url: p.url ?? '',
          description: p.description ?? '',
          tier: p.tier ?? 'optional',
          auth: p.auth ?? 'none',
          mcpBacked: Boolean(p.mcpBacked),
          envVars: p.envVars ?? [],
        }));
        for (const p of powers) {
          if (!p.name) fail(`presets/${name}/${powersFile.source}: a power entry has no \`name\``);
          if (!p.description) {
            fail(`presets/${name}/${powersFile.source}: power \`${p.name}\` has no description`);
          }
        }
      } catch (error) {
        fail(`presets/${name}/${powersFile.source}: not valid JSON (${error.message})`);
      }
    }
  }

  const hookFiles = files
    .filter((f) => f.type === 'hook' && f.source.endsWith('.js'))
    .map((f) => ({ id: path.basename(f.source, '.js'), link: linkOf(f) }));

  const nativeHooks = files
    .filter((f) => f.source.endsWith('.kiro.hook'))
    .map((f) => ({ id: path.basename(f.source, '.kiro.hook'), link: linkOf(f) }));

  // Every declared file must exist, not just the ones we render.
  for (const file of files) {
    if (!existsSync(srcOf(file))) {
      fail(`presets/${name}/${file.source}: declared in manifest.json but missing on disk`);
    }
  }

  const sortById = (a, b) => a.id.localeCompare(b.id);
  commands.sort(sortById);
  agents.sort(sortById);
  skills.sort(sortById);
  workflows.sort(sortById);
  hookFiles.sort(sortById);
  nativeHooks.sort(sortById);
  exampleSpecs.sort(sortById);

  // --- drift guard --------------------------------------------------------
  // Several manifest descriptions restate their own counts ("25 agents, 23
  // skills, 67 commands"). If that text ever falls behind the files on disk,
  // stop the build rather than publish a wrong number.
  const claimed = manifest.description?.match(
    /(\d+)\s+agents.*?(\d+)\s+skills.*?(\d+)\s+commands/s,
  );
  if (claimed) {
    const expected = { agents: agents.length, skills: skills.length, commands: commands.length };
    const actual = { agents: +claimed[1], skills: +claimed[2], commands: +claimed[3] };
    for (const key of ['agents', 'skills', 'commands']) {
      if (expected[key] !== actual[key]) {
        fail(
          `presets/${name}/manifest.json: description claims ${actual[key]} ${key}, ` +
            `but ${expected[key]} are declared. Update the description.`,
        );
      }
    }
  }

  return {
    name,
    version: manifest.version ?? '',
    description: manifest.description ?? '',
    category: manifest.category ?? '',
    tags: manifest.tags ?? [],
    mcpServers: Object.keys(manifest.mcpServers ?? {}).sort(),
    hookEvents: manifest.hooks ?? {},
    fileCount: files.length,
    commands,
    agents,
    skills,
    workflows,
    exampleSpecs,
    powers,
    hookFiles,
    nativeHooks,
  };
}

/** Powers are grouped by tier, in this order. */
const POWER_TIERS = ['essential', 'recommended', 'optional'];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function table(headers, rows) {
  if (rows.length === 0) return '_None._\n';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}\n`;
}

function renderPresetPage(preset) {
  const {
    name,
    version,
    description,
    category,
    tags,
    mcpServers,
    hookEvents,
    fileCount,
    commands,
    agents,
    skills,
    workflows,
    exampleSpecs,
    powers,
    hookFiles,
    nativeHooks,
  } = preset;

  const sections = [];

  sections.push(`---
title: ${yamlString(name)}
description: ${yamlString(description)}
---

${banner}
`);

  sections.push(`\`npx kiro-kit add ${name}\`

${prose(description)}
`);

  sections.push(`## At a glance

${table(
  ['Artifact', 'Count'],
  [
    ['Commands', String(commands.length)],
    ['Agents', String(agents.length)],
    ['Skills', String(skills.length)],
    ['Workflows', String(workflows.length)],
    ['Hook scripts', String(hookFiles.length)],
    ['Native Kiro hooks', String(nativeHooks.length)],
    ['Files written in total', String(fileCount)],
  ],
)}
Category: \`${category}\` &middot; Version: \`${version}\`

${tags.length ? `Tags: ${tags.map((t) => `\`${t}\``).join(', ')}\n` : ''}`);

  sections.push(`## Commands

${table(
  ['Command', 'Description'],
  commands.map((c) => [`[\`${cell(c.id)}\`](${c.link})`, cell(c.description)]),
)}`);

  sections.push(`## Agents

${table(
  ['Agent', 'Description'],
  agents.map((a) => [`[\`${cell(a.id)}\`](${a.link})`, cell(a.description)]),
)}`);

  sections.push(`## Skills

${table(
  ['Skill', 'Description'],
  skills.map((s) => [`[\`${cell(s.id)}\`](${s.link})`, cell(s.description)]),
)}`);

  sections.push(`## Workflows

${table(
  ['Workflow'],
  workflows.map((w) => [`[\`${cell(w.id)}\`](${w.link})`]),
)}`);

  const hookRows = Object.entries(hookEvents).flatMap(([event, names]) =>
    (Array.isArray(names) ? names : []).map((hook) => [`\`${cell(event)}\``, `\`${cell(hook)}\``]),
  );
  sections.push(`## Hooks

Registered in \`settings.json\`:

${table(['Event', 'Hook'], hookRows)}
Hook scripts shipped with this preset:

${table(
  ['Script'],
  hookFiles.map((h) => [`[\`${cell(h.id)}\`](${h.link})`]),
)}
Native Kiro Agent Hooks (ship disabled; enable them in Kiro's Agent Hooks panel):

${table(
  ['Native hook'],
  nativeHooks.map((h) => [`[\`${cell(h.id)}\`](${h.link})`]),
)}`);

  sections.push(`## MCP servers

${table(
  ['Server'],
  mcpServers.map((s) => [`\`${cell(s)}\``]),
)}`);

  sections.push(`## Kiro Powers

Recommended [Kiro Powers](https://kiro.dev/powers/) for this preset. \`init\`
auto-wires the credential-free MCP-backed ones and scaffolds the credentialed
ones disabled.

${table(
  ['Tier', 'Power', 'Description', 'Auth', 'MCP-backed'],
  [...powers]
    .sort(
      (a, b) =>
        POWER_TIERS.indexOf(a.tier) - POWER_TIERS.indexOf(b.tier) ||
        a.name.localeCompare(b.name),
    )
    .map((p) => [
      `\`${cell(p.tier)}\``,
      p.url ? `[${cell(p.name)}](${p.url})` : cell(p.name),
      cell(p.description),
      `\`${cell(p.auth)}\``,
      p.mcpBacked ? 'yes' : 'no',
    ]),
)}`);

  sections.push(`## Example specs

Fully-written \`requirements.md\` / \`design.md\` / \`tasks.md\` trios you can read
as worked examples.

${table(
  ['Spec'],
  exampleSpecs.map((s) => [`[${cell(s.title)}](${s.link})`]),
)}`);

  return `${sections.join('\n')}\n`;
}

function renderIndexPage(presets, thresholds) {
  const rows = presets.map((p) => [
    `[\`${cell(p.name)}\`](/docs/reference/presets/${p.name})`,
    String(p.commands.length),
    String(p.agents.length),
    String(p.skills.length),
    String(p.workflows.length),
    cell(p.category),
  ]);

  const thresholdTable = thresholds.length
    ? table(
        ['Artifact', 'Minimum'],
        thresholds.map((t) => [cell(t.artifact), String(t.min)]),
      )
    : '_Could not read thresholds._\n';

  return `---
title: "Preset Reference"
description: "Every preset that ships with kiro-kit, with its full command, agent, and skill catalog."
---

${banner}

Every table in this section is generated from \`presets/*/manifest.json\` and the
files those manifests declare. If it is listed here, it ships.

## Presets

${table(['Preset', 'Commands', 'Agents', 'Skills', 'Workflows', 'Category'], rows)}
## Totals

${table(
  ['Artifact', 'Total across all presets'],
  [
    ['Presets', String(presets.length)],
    ['Commands', String(presets.reduce((n, p) => n + p.commands.length, 0))],
    ['Agents', String(presets.reduce((n, p) => n + p.agents.length, 0))],
    ['Skills', String(presets.reduce((n, p) => n + p.skills.length, 0))],
  ],
)}
Presets are self-contained, so these totals count each preset's own copy of an
artifact separately. Two presets shipping a \`code-reviewer\` agent count as two.

## Kiro Powers by preset

Each preset recommends curated [Kiro Powers](https://kiro.dev/powers/) grouped by
priority tier.

${table(
  ['Preset', 'Essential', 'Recommended', 'Optional'],
  presets.map((p) => [
    `[\`${cell(p.name)}\`](/docs/reference/presets/${p.name})`,
    ...POWER_TIERS.map((tier) => {
      const names = p.powers.filter((x) => x.tier === tier).map((x) => cell(x.name));
      return names.length ? names.join(', ') : '—';
    }),
  ]),
)}
## Example specs by preset

${table(
  ['Preset', 'Worked example specs'],
  presets.map((p) => [
    `[\`${cell(p.name)}\`](/docs/reference/presets/${p.name})`,
    p.exampleSpecs.length ? p.exampleSpecs.map((s) => cell(s.title)).join(' · ') : '—',
  ]),
)}
## Minimum thresholds

Every preset must meet these minimums. They are enforced by
[\`preset-thresholds.test.ts\`](${GITHUB}/packages/cli/tests/structural/preset-thresholds.test.ts),
and this table is read from that test file.

${thresholdTable}`;
}

/** Read the enforced minimums straight out of the structural test. */
async function readThresholds() {
  if (!existsSync(thresholdsTest)) {
    fail(`${path.relative(repoRoot, thresholdsTest)}: missing, cannot read preset thresholds`);
    return [];
  }
  const source = await readFile(thresholdsTest, 'utf8');
  const found = [...source.matchAll(/has >= (\d+) (\w+)/g)].map((m) => ({
    artifact: m[2],
    min: Number(m[1]),
  }));
  if (found.length === 0) {
    fail(`${path.relative(repoRoot, thresholdsTest)}: no \`has >= N <artifact>\` cases found`);
  }
  // The test repeats the same block per preset; collapse to unique artifacts.
  const seen = new Map();
  for (const t of found) {
    if (!seen.has(t.artifact)) seen.set(t.artifact, t.min);
    else if (seen.get(t.artifact) !== t.min) {
      fail(`preset-thresholds.test.ts: conflicting minimums for ${t.artifact}`);
    }
  }
  return [...seen].map(([artifact, min]) => ({ artifact, min }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const presetNames = (await readdir(presetsDir, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => e.name)
  .filter((n) => existsSync(path.join(presetsDir, n, 'manifest.json')))
  .sort();

if (presetNames.length === 0) {
  console.error('generate-docs-reference: no presets found under presets/');
  process.exit(1);
}

const presets = [];
for (const name of presetNames) presets.push(await loadPreset(name));
const thresholds = await readThresholds();

if (errors.size > 0) {
  console.error(`\ngenerate-docs-reference: ${errors.size} problem(s) found:\n`);
  for (const message of [...errors].sort()) console.error(`  - ${message}`);
  console.error('\nRefusing to generate docs from incomplete preset data.\n');
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, 'presets'), { recursive: true });

await writeFile(path.join(outDir, 'index.mdx'), renderIndexPage(presets, thresholds), 'utf8');
await writeFile(
  path.join(outDir, 'meta.json'),
  `${JSON.stringify({ title: 'Reference', pages: ['index', 'presets'] }, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(outDir, 'presets', 'meta.json'),
  `${JSON.stringify({ title: 'Presets', pages: presets.map((p) => p.name) }, null, 2)}\n`,
  'utf8',
);

for (const preset of presets) {
  await writeFile(
    path.join(outDir, 'presets', `${preset.name}.mdx`),
    renderPresetPage(preset),
    'utf8',
  );
}

const totals = presets.reduce(
  (acc, p) => ({
    commands: acc.commands + p.commands.length,
    agents: acc.agents + p.agents.length,
    skills: acc.skills + p.skills.length,
  }),
  { commands: 0, agents: 0, skills: 0 },
);

console.log(
  `generate-docs-reference: ${presets.length} presets -> ` +
    `${totals.commands} commands, ${totals.agents} agents, ${totals.skills} skills`,
);
