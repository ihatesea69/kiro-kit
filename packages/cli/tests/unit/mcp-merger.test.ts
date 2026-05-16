import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeMCP, type MCPConfig, type MCPServerEntry } from '../../src/core/merge/mergeMCP.js';

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

describe('MCP Merger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('user-priority: existing server is not overwritten', () => {
    const existing: MCPConfig = {
      mcpServers: {
        filesystem: { command: 'user-fs-cmd', args: ['--user'] },
      },
    };

    const presetServers: Record<string, MCPServerEntry> = {
      filesystem: { command: 'preset-fs-cmd', args: ['--preset'] },
    };

    const result = mergeMCP(existing, presetServers, 'frontend');

    expect(result.mcpServers['filesystem'].command).toBe('user-fs-cmd');
    expect(result.mcpServers['filesystem'].args).toEqual(['--user']);
  });

  it('adds new servers from preset without deleting existing', () => {
    const existing: MCPConfig = {
      mcpServers: {
        filesystem: { command: 'fs-cmd' },
      },
    };

    const presetServers: Record<string, MCPServerEntry> = {
      playwright: { command: 'npx', args: ['playwright'] },
    };

    const result = mergeMCP(existing, presetServers);

    // Existing preserved
    expect(result.mcpServers['filesystem']).toBeDefined();
    // New added
    expect(result.mcpServers['playwright']).toBeDefined();
    expect(result.mcpServers['playwright'].command).toBe('npx');
  });

  it('does not delete user servers not in preset', () => {
    const existing: MCPConfig = {
      mcpServers: {
        'my-custom-server': { command: 'custom-cmd' },
      },
    };

    const presetServers: Record<string, MCPServerEntry> = {
      filesystem: { command: 'fs-cmd' },
    };

    const result = mergeMCP(existing, presetServers);

    expect(result.mcpServers['my-custom-server']).toBeDefined();
    expect(result.mcpServers['filesystem']).toBeDefined();
  });

  it('warns on cross-preset conflict (same server name)', () => {
    const existing: MCPConfig = {
      mcpServers: {
        'docs-seeker': { command: 'existing-docs' },
      },
    };

    const presetServers: Record<string, MCPServerEntry> = {
      'docs-seeker': { command: 'preset-docs' },
    };

    mergeMCP(existing, presetServers, 'backend');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('docs-seeker'),
    );
  });

  it('handles null existing config', () => {
    const presetServers: Record<string, MCPServerEntry> = {
      filesystem: { command: 'fs-cmd' },
    };

    const result = mergeMCP(null, presetServers);

    expect(result.mcpServers['filesystem']).toBeDefined();
  });
});
