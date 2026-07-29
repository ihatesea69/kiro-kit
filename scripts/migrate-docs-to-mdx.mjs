#!/usr/bin/env node
/**
 * One-shot migration: docs/*.md prose -> apps/docs/content/docs/**.mdx
 *
 * Strips the leading `# Title` (Fumadocs renders the title from frontmatter),
 * adds `title`/`description` frontmatter, and writes the file to its new home.
 *
 * This script is not part of the docs build. It exists so the migration is
 * reproducible and reviewable rather than a pile of manual copy-paste.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const src = path.join(repoRoot, 'docs');
const dest = path.join(repoRoot, 'apps', 'docs', 'content', 'docs');

/** @type {{from: string, to: string, title: string, description: string}[]} */
const MIGRATIONS = [
  {
    from: 'how-it-works.md',
    to: 'guide/how-it-works.mdx',
    title: 'How It Works',
    description:
      'The preset model, the init/add/update/restore lifecycle, merge semantics, conflict resolution, and backups.',
  },
  {
    from: 'architecture.md',
    to: 'guide/architecture.mdx',
    title: 'Architecture',
    description:
      'Repository layout, CLI module breakdown, key design decisions, build pipeline, and test architecture.',
  },
  {
    from: 'creating-presets.md',
    to: 'guide/creating-presets.mdx',
    title: 'Creating Presets',
    description:
      'Author a new preset: directory structure, manifest schema, file conventions, and validation requirements.',
  },
  // Deliberately NOT migrated: docs/code-standards.md, docs/system-architecture.md
  // and docs/project-roadmap.md. Those three are unfilled kiro-kit preset
  // templates that the repo dogfooded onto itself (they are listed as install
  // targets in .kiro/.kiro-kit.json) and describe a generic web service rather
  // than Kiro-Kit. Publishing them would be worse than having no page.
  {
    from: 'release-process.md',
    to: 'contributing/releasing.mdx',
    title: 'Releasing',
    description: 'The release workflow for kiro-kit, from version bump to npm publication.',
  },
  {
    from: 'faq.md',
    to: 'faq.mdx',
    title: 'FAQ',
    description: 'Common questions about installing, using, and troubleshooting kiro-kit.',
  },
];

/** YAML-quote a scalar for frontmatter. */
function yamlString(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Drop the leading H1 and any blank lines that follow it. */
function stripLeadingH1(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (!lines[0]?.startsWith('# ')) return markdown;
  let i = 1;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  return lines.slice(i).join('\n');
}

let migrated = 0;
for (const { from, to, title, description } of MIGRATIONS) {
  const raw = await readFile(path.join(src, from), 'utf8');
  const body = stripLeadingH1(raw).trimEnd();
  const frontmatter = `---\ntitle: ${yamlString(title)}\ndescription: ${yamlString(description)}\n---\n\n`;

  const target = path.join(dest, to);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${frontmatter}${body}\n`, 'utf8');
  console.log(`  ${from} -> content/docs/${to}`);
  migrated += 1;
}

console.log(`\nMigrated ${migrated} file(s).`);
