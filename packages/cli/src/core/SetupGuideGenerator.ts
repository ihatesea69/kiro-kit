import fs from 'node:fs';
import path from 'node:path';
import { KKError, ErrorCodes } from './errors.js';
import type { PowerEntry, PowerTier } from './PowersLoader.js';
import type { MCPServerEntry } from './MCPConfigurator.js';

/**
 * SetupGuideGenerator — creates POWERS-SETUP.md with installation instructions.
 *
 * Groups Powers by tier (essential first, then recommended, then optional),
 * includes marketplace URLs, and provides step-by-step instructions for
 * installing each Power via Kiro IDE.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupGuideOptions {
  powers: PowerEntry[];
  presetNames: string[];
  mcpServers: Record<string, MCPServerEntry>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETUP_GUIDE_FILENAME = 'POWERS-SETUP.md';
const KIRO_DIR = '.kiro';

/** Tier display order and labels. */
const TIER_ORDER: { tier: PowerTier; heading: string }[] = [
  { tier: 'essential', heading: 'Essential Powers (install these first)' },
  { tier: 'recommended', heading: 'Recommended Powers' },
  { tier: 'optional', heading: 'Optional Powers' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate POWERS-SETUP.md content.
 * Powers are grouped by tier with marketplace URLs and install instructions.
 */
export function generateSetupGuide(options: SetupGuideOptions): string {
  const { powers, presetNames, mcpServers } = options;
  const lines: string[] = [];

  lines.push('# Kiro Powers Setup Guide');
  lines.push('');
  lines.push(`## Presets: ${presetNames.join(', ')}`);
  lines.push('');

  // Group powers by tier
  let counter = 0;
  for (const { tier, heading } of TIER_ORDER) {
    const tierPowers = powers.filter((p) => p.tier === tier);
    if (tierPowers.length === 0) {
      continue;
    }

    lines.push(`## ${heading}`);
    lines.push('');

    for (const power of tierPowers) {
      counter += 1;
      lines.push(`### ${counter}. ${power.name}`);
      lines.push(`- URL: ${power.url}`);
      lines.push(`- Description: ${power.description}`);
      lines.push(`- How to install: Open Kiro IDE > Powers panel > Search "${power.name}" > Click Install`);
      lines.push('');
    }
  }

  // MCP servers section
  const serverNames = Object.keys(mcpServers);
  if (serverNames.length > 0) {
    lines.push('## MCP Servers (auto-configured)');
    lines.push('');
    lines.push('The following MCP servers have been configured in `.mcp.json`:');
    lines.push('');

    for (const name of serverNames) {
      const entry = mcpServers[name];
      if (entry.requiresCredentials) {
        lines.push(`- **${name}** (disabled, requires credentials)`);
      } else {
        lines.push(`- **${name}** (enabled)`);
      }
    }

    lines.push('');
    lines.push('To enable disabled servers, set the required environment variables');
    lines.push('and remove the `_disabled_` prefix from the server key in `.mcp.json`.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Write setup guide to .kiro/ directory.
 * Creates the .kiro directory if it does not exist.
 * Throws KKError if write fails.
 */
export function writeSetupGuide(workspaceRoot: string, content: string): void {
  const dirPath = path.join(workspaceRoot, KIRO_DIR);
  const filePath = path.join(dirPath, SETUP_GUIDE_FILENAME);

  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new KKError(
      ErrorCodes.MCP_MERGE_CONFLICT,
      `Failed to write ${SETUP_GUIDE_FILENAME}: ${message}`,
      'Check file permissions and ensure the .kiro directory is writable.',
    );
  }
}
