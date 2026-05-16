#!/usr/bin/env node
/**
 * _render-inventories.cjs
 *
 * Spec: claudekit-vs-kirokit-audit, Tasks 2.2 + 3.2 + 3.3
 *
 * Reads:
 *   - appendix/inventory-source.json  (133 entries)
 *   - appendix/inventory-target.json  (7 presets)
 *   - presets/<preset>/manifest.json  (for "in manifest?" column)
 *
 * Writes:
 *   - inventory-source.md
 *   - inventory-target-<preset>.md   x 7
 *   - inventory-target-summary.md
 *
 * Pure CommonJS. No external deps. Cross-platform.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const OUT_DIR = path.join('docs', 'audits', 'claudekit-vs-kirokit');
const APPENDIX_DIR = path.join(OUT_DIR, 'appendix');
const INV_SOURCE = path.join(APPENDIX_DIR, 'inventory-source.json');
const INV_TARGET = path.join(APPENDIX_DIR, 'inventory-target.json');
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

// Section order in inventory Markdown files. Matches the design's
// Artifact_Type table grouping while being readable.
const SECTION_ORDER = [
  ['agent', 'Agents'],
  ['command', 'Commands'],
  ['hook', 'Hooks'],
  ['skill', 'Skills'],
  ['workflow', 'Workflows'],
  ['steering', 'Steering'],
  ['spec_template', 'Spec Templates'],
  ['settings', 'Settings'],
  ['statusline', 'Statusline'],
  ['metadata', 'Metadata'],
  ['mcp_template', 'MCP Template'],
  ['env_example', 'Env Example'],
  ['docs_template', 'Docs Template'],
];

// Single artifact_type list used for the summary count table.
const ALL_TYPES = SECTION_ORDER.map(([t]) => t);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Truncate `s` to `max` chars; append … when truncated. Strips tabs and
 * collapses internal newlines/multiple spaces so cells stay on one row.
 