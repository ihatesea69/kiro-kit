import { logger } from '../../utils/logger.js';

export interface MCPConfig {
  mcpServers: Record<string, MCPServerEntry>;
  [key: string]: unknown;
}

export interface MCPServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
  [key: string]: unknown;
}

/**
 * Merge preset MCP servers into existing MCP config.
 * User-priority: existing servers are never overwritten or deleted.
 * Warns on cross-preset conflicts (same server name from different presets).
 */
export function mergeMCP(
  existing: MCPConfig | null,
  presetServers: Record<string, MCPServerEntry>,
  presetName?: string,
): MCPConfig {
  const result: MCPConfig = existing
    ? structuredClone(existing)
    : { mcpServers: {} };

  if (!result.mcpServers) {
    result.mcpServers = {};
  }

  for (const [serverName, def] of Object.entries(presetServers)) {
    if (serverName in result.mcpServers) {
      logger.warn(
        `MCP server "${serverName}" already exists, keeping user definition.` +
          (presetName ? ` (from preset: ${presetName})` : ''),
      );
      continue;
    }
    result.mcpServers[serverName] = structuredClone(def);
  }

  return result;
}
