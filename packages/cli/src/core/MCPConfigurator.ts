import fs from 'node:fs';
import path from 'node:path';
import { KKError, ErrorCodes } from './errors.js';

/**
 * MCPConfigurator — manages auto-configuration of MCP servers per preset.
 *
 * Generates functional `.mcp.json` files with preset-specific servers,
 * handles merge logic for existing configs, and uses `_disabled_` prefix
 * convention for servers requiring credentials.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  requiresCredentials?: boolean;
  credentialEnvVars?: string[];
}

export interface MCPPresetConfig {
  servers: Record<string, MCPServerEntry>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MCP_FILENAME = '.mcp.json';

/** Shared MCP server definitions. */
const SERVER_DEFINITIONS: Record<string, MCPServerEntry> = {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    requiresCredentials: false,
  },
  // Official git/fetch MCP servers are Python packages, run via uvx (requires `uv`).
  git: {
    command: 'uvx',
    args: ['mcp-server-git', '--repository', '.'],
    requiresCredentials: false,
  },
  fetch: {
    command: 'uvx',
    args: ['mcp-server-fetch'],
    requiresCredentials: false,
  },
  playwright: {
    command: 'npx',
    args: ['-y', '@playwright/mcp'],
    requiresCredentials: false,
  },
  // --- Additional credential-free servers (auto-enabled) ---
  memory: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    requiresCredentials: false,
  },
  sequentialthinking: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    requiresCredentials: false,
  },
  context7: {
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    requiresCredentials: false,
  },
  // --- Credentialed servers (scaffolded disabled) ---
  github: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}' },
    requiresCredentials: true,
    credentialEnvVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  },
  sentry: {
    command: 'npx',
    args: ['-y', '@sentry/mcp-server'],
    env: { SENTRY_AUTH_TOKEN: '${SENTRY_AUTH_TOKEN}' },
    requiresCredentials: true,
    credentialEnvVars: ['SENTRY_AUTH_TOKEN'],
  },
  postgres: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: { POSTGRES_URL: '${POSTGRES_URL}' },
    requiresCredentials: true,
    credentialEnvVars: ['POSTGRES_URL'],
  },
};

/** Preset-to-server mapping. */
const PRESET_SERVERS: Record<string, { default: string[]; optional: string[] }> = {
  frontend: {
    default: ['filesystem', 'git', 'fetch', 'playwright', 'context7', 'memory'],
    optional: ['sentry'],
  },
  backend: {
    default: ['filesystem', 'git', 'fetch', 'context7', 'memory', 'sequentialthinking'],
    optional: ['postgres', 'github', 'sentry'],
  },
  fullstack: {
    default: ['filesystem', 'git', 'fetch', 'playwright', 'context7', 'memory'],
    optional: ['postgres', 'github', 'sentry'],
  },
  mobile: {
    default: ['filesystem', 'git', 'fetch', 'context7', 'memory'],
    optional: ['sentry'],
  },
  devops: {
    default: ['filesystem', 'git', 'fetch', 'context7', 'sequentialthinking'],
    optional: ['postgres', 'github'],
  },
  'data-ai': {
    default: ['filesystem', 'git', 'fetch', 'context7', 'memory', 'sequentialthinking'],
    optional: ['postgres', 'github'],
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get preset-specific MCP server configuration.
 * Servers requiring no credentials are enabled by default.
 * Servers requiring credentials are included with `requiresCredentials: true`.
 */
export function getMCPConfig(presetName: string): MCPPresetConfig {
  const mapping = PRESET_SERVERS[presetName];
  if (!mapping) {
    return { servers: {} };
  }

  const servers: Record<string, MCPServerEntry> = {};

  for (const name of mapping.default) {
    const def = SERVER_DEFINITIONS[name];
    if (def) {
      servers[name] = { ...def };
    }
  }

  for (const name of mapping.optional) {
    const def = SERVER_DEFINITIONS[name];
    if (def) {
      servers[name] = { ...def };
    }
  }

  return { servers };
}

/**
 * Merge new MCP config with existing `.mcp.json` without overwriting user entries.
 * Existing keys in `mcpServers` are preserved with their original values.
 * New keys from incoming config are added (using `_disabled_` prefix for credential servers).
 */
export function mergeMCPConfig(
  existing: Record<string, unknown> | null,
  incoming: MCPPresetConfig,
): Record<string, unknown> {
  const existingServers: Record<string, unknown> =
    existing && typeof existing === 'object' && existing !== null
      ? ((existing as Record<string, unknown>).mcpServers as Record<string, unknown>) ?? {}
      : {};

  const merged: Record<string, unknown> = { ...existingServers };

  for (const [name, entry] of Object.entries(incoming.servers)) {
    const outputKey = entry.requiresCredentials ? `_disabled_${name}` : name;

    // Do not overwrite existing user entries (check both enabled and disabled keys).
    if (merged[name] !== undefined || merged[`_disabled_${name}`] !== undefined) {
      continue;
    }

    const serverObj: Record<string, unknown> = { command: entry.command };
    if (entry.args && entry.args.length > 0) {
      serverObj.args = entry.args;
    }
    if (entry.env && Object.keys(entry.env).length > 0) {
      serverObj.env = entry.env;
    }
    if (entry.requiresCredentials) {
      serverObj._comment = `Requires ${entry.credentialEnvVars?.join(', ') ?? 'credentials'} environment variable. Remove '_disabled_' prefix to enable.`;
    }

    merged[outputKey] = serverObj;
  }

  const result: Record<string, unknown> = { ...(existing ?? {}) };
  result.mcpServers = merged;
  return result;
}

/**
 * Write the final `.mcp.json` to workspace root.
 * Throws KKError if write fails.
 */
export function writeMCPConfig(
  workspaceRoot: string,
  config: Record<string, unknown>,
): void {
  const filePath = path.join(workspaceRoot, MCP_FILENAME);
  const content = JSON.stringify(config, null, 2) + '\n';

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new KKError(
      ErrorCodes.MCP_MERGE_CONFLICT,
      `Failed to write ${MCP_FILENAME}: ${message}`,
      'Check file permissions and ensure the directory exists.',
    );
  }
}
