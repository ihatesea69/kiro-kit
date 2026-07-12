import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';

interface SpecNewOptions {
  from?: string;
  force?: boolean;
}

const SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md'] as const;

/** Humanize a kebab/snake spec name into a Title Case feature name. */
function humanize(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Locate a `_templates/<preset>/` directory to copy from, if one is installed. */
function findTemplateDir(workspaceRoot: string, from?: string): string | null {
  const templatesRoot = path.join(workspaceRoot, '.kiro/specs/_templates');
  if (!fs.existsSync(templatesRoot)) return null;

  if (from) {
    const candidate = path.join(templatesRoot, from);
    return fs.existsSync(candidate) ? candidate : null;
  }

  // No --from: pick the first template directory that has all three files.
  try {
    for (const entry of fs.readdirSync(templatesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(templatesRoot, entry.name);
      if (SPEC_FILES.every((f) => fs.existsSync(path.join(dir, f)))) return dir;
    }
  } catch {
    /* fall through to generic */
  }
  return null;
}

/** Generic fallback templates when no installed _templates are found. */
function genericTemplate(file: (typeof SPEC_FILES)[number], feature: string): string {
  switch (file) {
    case 'requirements.md':
      return `# Requirements Document

## Introduction

Describe ${feature} in two or three sentences: the problem, the users, and the goal.

## Glossary

- **Term** — definition

## Requirements

### Requirement 1: <title>

**User Story:** As a [role], I want [feature], so that [benefit].

#### Acceptance Criteria

1. WHEN <event> THE SYSTEM SHALL <response>
2. IF <condition> THEN THE SYSTEM SHALL <response>
3. WHILE <state> THE SYSTEM SHALL <behavior>
`;
    case 'design.md':
      return `# Design: ${feature}

## Architecture

### System Context

How this feature fits into the overall system.

### Component Design

\`\`\`mermaid
flowchart LR
  A[Client] --> B[Service] --> C[(Data)]
\`\`\`

## Data Models

## Error Handling

## Testing Strategy
`;
    case 'tasks.md':
      return `# Implementation Plan: ${feature}

## Overview

Two or three sentences describing the build order.

## Tasks

- [ ] 1. First increment
  - [ ] 1.1 Sub-task
  - _Requirements: R1.1_
`;
  }
}

function runSpecNew(name: string, opts: SpecNewOptions): void {
  const workspaceRoot = process.cwd();

  const safeName = name.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-_]*$/.test(safeName)) {
    logger.error(
      `Invalid spec name "${name}". Use letters, numbers, hyphens, and underscores.`,
    );
    process.exit(1);
  }

  const specDir = path.join(workspaceRoot, '.kiro/specs', safeName);
  if (fs.existsSync(specDir) && !opts.force) {
    logger.error(
      `Spec "${safeName}" already exists at .kiro/specs/${safeName}. Use --force to overwrite.`,
    );
    process.exit(1);
  }

  const feature = humanize(safeName);
  const templateDir = findTemplateDir(workspaceRoot, opts.from);

  if (opts.from && !templateDir) {
    logger.error(
      `No template found for --from "${opts.from}" under .kiro/specs/_templates/.`,
    );
    process.exit(1);
  }

  fs.mkdirSync(specDir, { recursive: true });

  for (const file of SPEC_FILES) {
    let content: string;
    if (templateDir) {
      const src = path.join(templateDir, file);
      content = fs.existsSync(src)
        ? fs.readFileSync(src, 'utf-8')
        : genericTemplate(file, feature);
    } else {
      content = genericTemplate(file, feature);
    }
    // Pre-fill the feature name into template placeholders.
    content = content.replace(/\[Feature Name\]/g, feature);
    fs.writeFileSync(path.join(specDir, file), content, 'utf-8');
  }

  // Write the Kiro spec config marker.
  const config = {
    specId: crypto.randomUUID(),
    workflowType: 'requirements-first',
    specType: 'feature',
  };
  fs.writeFileSync(
    path.join(specDir, '.config.kiro'),
    JSON.stringify(config),
    'utf-8',
  );

  process.stdout.write(
    `${color.green('Created')} spec .kiro/specs/${safeName}/ ` +
      `(requirements.md, design.md, tasks.md)` +
      `${templateDir ? ` from ${path.basename(templateDir)} template` : ''}\n`,
  );
  process.stdout.write(
    `Next: fill in requirements.md, then review before moving to design.\n`,
  );
}

export function registerSpecCommand(program: Command): void {
  const spec = program
    .command('spec')
    .description('Work with Kiro specs');

  spec
    .command('new <name>')
    .description('Scaffold a new spec folder from a template')
    .option('--from <preset>', 'Use the _templates/<preset> template')
    .option('--force', 'Overwrite an existing spec directory')
    .action((name: string, opts: SpecNewOptions) => {
      try {
        runSpecNew(name, opts);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
