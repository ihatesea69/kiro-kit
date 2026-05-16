import { logger } from '../../utils/logger.js';

export interface HookRef {
  command: string;
  [key: string]: unknown;
}

export interface SettingsConfig {
  statusLine?: { type?: string; command?: string; [key: string]: unknown };
  hooks?: {
    PreToolUse?: HookRef[];
    PostToolUse?: HookRef[];
    agentStop?: HookRef[];
    [key: string]: unknown;
  };
  includeCoAuthoredBy?: boolean;
  [key: string]: unknown;
}

/**
 * Merge preset settings into existing settings.
 * - Array fields (hooks.PreToolUse, hooks.PostToolUse, etc.): concat-dedupe by `command`
 * - Non-array fields: last-write-wins with warning
 * - Preserves user-added fields not in preset
 */
export function mergeSettings(
  existing: SettingsConfig | null,
  preset: SettingsConfig,
): SettingsConfig {
  const result: SettingsConfig = existing
    ? structuredClone(existing)
    : {};

  // Merge hooks arrays with dedup by command
  if (preset.hooks) {
    if (!result.hooks) result.hooks = {};

    for (const key of ['PreToolUse', 'PostToolUse', 'agentStop'] as const) {
      const presetArr = preset.hooks[key];
      if (!presetArr || presetArr.length === 0) continue;

      const existingArr: HookRef[] = (result.hooks[key] as HookRef[]) ?? [];
      const existingCommands = new Set(existingArr.map((h) => h.command));

      for (const hook of presetArr) {
        if (!existingCommands.has(hook.command)) {
          existingArr.push(structuredClone(hook));
        }
      }
      (result.hooks as Record<string, unknown>)[key] = existingArr;
    }
  }

  // Merge non-array scalar fields with last-write-wins + warning
  if (preset.statusLine !== undefined) {
    if (result.statusLine !== undefined) {
      logger.warn('statusLine already set in settings, overwriting with preset value.');
    }
    result.statusLine = structuredClone(preset.statusLine);
  }

  if (preset.includeCoAuthoredBy !== undefined) {
    if (result.includeCoAuthoredBy !== undefined && result.includeCoAuthoredBy !== preset.includeCoAuthoredBy) {
      logger.warn('includeCoAuthoredBy already set, overwriting with preset value.');
    }
    result.includeCoAuthoredBy = preset.includeCoAuthoredBy;
  }

  return result;
}
