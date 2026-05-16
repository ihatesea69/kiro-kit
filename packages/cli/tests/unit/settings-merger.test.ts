import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeSettings, type SettingsConfig } from '../../src/core/merge/mergeSettings.js';

// Mock logger to capture warnings
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../../src/utils/logger.js';

describe('Settings Merger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('array dedupe by command', () => {
    it('deduplicates hooks by command field', () => {
      const existing: SettingsConfig = {
        hooks: {
          PreToolUse: [{ command: 'node .kiro/hooks/scout-block.js' }],
        },
      };

      const preset: SettingsConfig = {
        hooks: {
          PreToolUse: [
            { command: 'node .kiro/hooks/scout-block.js' }, // duplicate
            { command: 'node .kiro/hooks/new-hook.js' },    // new
          ],
        },
      };

      const result = mergeSettings(existing, preset);

      expect(result.hooks!.PreToolUse).toHaveLength(2);
      const commands = (result.hooks!.PreToolUse as any[]).map((h) => h.command);
      expect(commands).toContain('node .kiro/hooks/scout-block.js');
      expect(commands).toContain('node .kiro/hooks/new-hook.js');
    });

    it('merges multiple hook arrays independently', () => {
      const existing: SettingsConfig = {
        hooks: {
          PreToolUse: [{ command: 'pre-cmd' }],
          PostToolUse: [{ command: 'post-cmd' }],
        },
      };

      const preset: SettingsConfig = {
        hooks: {
          PreToolUse: [{ command: 'pre-cmd-2' }],
          agentStop: [{ command: 'stop-cmd' }],
        },
      };

      const result = mergeSettings(existing, preset);

      expect(result.hooks!.PreToolUse).toHaveLength(2);
      expect(result.hooks!.PostToolUse).toHaveLength(1);
      expect(result.hooks!.agentStop).toHaveLength(1);
    });
  });

  describe('non-array last-write-wins', () => {
    it('overwrites statusLine with warning', () => {
      const existing: SettingsConfig = {
        statusLine: { type: 'command', command: 'old-cmd' },
      };

      const preset: SettingsConfig = {
        statusLine: { type: 'command', command: 'new-cmd' },
      };

      const result = mergeSettings(existing, preset);

      expect(result.statusLine!.command).toBe('new-cmd');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('statusLine'),
      );
    });

    it('overwrites includeCoAuthoredBy with warning when different', () => {
      const existing: SettingsConfig = { includeCoAuthoredBy: true };
      const preset: SettingsConfig = { includeCoAuthoredBy: false };

      const result = mergeSettings(existing, preset);

      expect(result.includeCoAuthoredBy).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('includeCoAuthoredBy'),
      );
    });
  });

  describe('preserve user-only fields', () => {
    it('preserves fields not present in preset', () => {
      const existing: SettingsConfig = {
        statusLine: { type: 'command', command: 'user-cmd' },
        hooks: {
          PreToolUse: [{ command: 'user-hook' }],
        },
        customUserField: 'user-value',
      } as SettingsConfig;

      const preset: SettingsConfig = {
        hooks: {
          PostToolUse: [{ command: 'preset-hook' }],
        },
      };

      const result = mergeSettings(existing, preset);

      expect((result as any).customUserField).toBe('user-value');
      expect(result.statusLine!.command).toBe('user-cmd');
    });
  });
});
