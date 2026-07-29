/**
 * Unit tests for src/core/mcp/normalizeMCP.ts
 *
 * Regression cover for the "every MCP server is red in Kiro" bug: a freshly
 * initialised workspace must contain only servers Kiro can actually start,
 * with anything else explicitly disabled rather than left to fail.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeServer,
  normalizeServerMap,
  normalizeMCPConfig,
} from '../../src/core/mcp/normalizeMCP.js';

const opts = { workspaceRoot: '/home/dev/project' };

describe('normalizeServer', () => {
  it('substitutes ${WORKSPACE_ROOT} in args', () => {
    const result = normalizeServer(
      {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '${WORKSPACE_ROOT}'],
      },
      opts,
    );
    expect(result.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
      '/home/dev/project',
    ]);
    expect(JSON.stringify(result)).not.toContain('${WORKSPACE_ROOT}');
  });

  it('enables a credential-free npx server', () => {
    const result = normalizeServer(
      { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      opts,
    );
    expect(result.disabled).toBe(false);
    expect(result.autoApprove).toEqual([]);
  });

  it('disables a server whose env still has an unresolved placeholder', () => {
    const result = normalizeServer(
      {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}' },
      },
      opts,
    );
    expect(result.disabled).toBe(true);
    expect(result._comment).toContain('GITHUB_PERSONAL_ACCESS_TOKEN');
  });

  it('disables uvx servers, which need the uv toolchain', () => {
    const result = normalizeServer(
      { command: 'uvx', args: ['mcp-server-git', '--repository', '.'] },
      opts,
    );
    expect(result.disabled).toBe(true);
    expect(result._comment).toContain('uv');
  });

  it('never emits the legacy _disabled_ instruction', () => {
    const result = normalizeServer(
      { command: 'uvx', args: ['mcp-server-fetch'] },
      opts,
    );
    expect(result._comment).not.toContain('_disabled_');
  });

  it('honours an explicit disabled flag over the inferred one', () => {
    // A user who enabled the git server after installing uv must not have it
    // switched back off by a later `init`.
    const result = normalizeServer(
      { command: 'uvx', args: ['mcp-server-git'], disabled: false },
      opts,
    );
    expect(result.disabled).toBe(false);
  });

  it('keeps an explicitly disabled credential-free server disabled', () => {
    const result = normalizeServer(
      { command: 'npx', args: ['-y', '@upstash/context7-mcp'], disabled: true },
      opts,
    );
    expect(result.disabled).toBe(true);
  });
});

describe('normalizeServerMap', () => {
  it('migrates a legacy _disabled_ key to a real name with disabled: true', () => {
    const result = normalizeServerMap(
      {
        _disabled_github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          _comment: "Remove '_disabled_' prefix to enable.",
        },
      },
      opts,
    );

    expect(Object.keys(result)).toEqual(['github']);
    expect(result.github.disabled).toBe(true);
    expect(result.github._comment).not.toContain('_disabled_');
  });

  it('keeps the live definition when both a real and a legacy key exist', () => {
    const result = normalizeServerMap(
      {
        github: { command: 'npx', args: ['live'], disabled: false },
        _disabled_github: { command: 'npx', args: ['stale'] },
      },
      opts,
    );

    expect(Object.keys(result)).toEqual(['github']);
    expect(result.github.args).toEqual(['live']);
    expect(result.github.disabled).toBe(false);
  });

  it('skips non-object entries rather than throwing', () => {
    const result = normalizeServerMap(
      { good: { command: 'npx' }, bad: null as unknown as Record<string, unknown> },
      opts,
    );
    expect(Object.keys(result)).toEqual(['good']);
  });
});

describe('normalizeMCPConfig', () => {
  it('produces a config where every enabled server can start unattended', () => {
    const result = normalizeMCPConfig(
      {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '${WORKSPACE_ROOT}'],
          },
          git: { command: 'uvx', args: ['mcp-server-git', '--repository', '.'] },
          fetch: { command: 'uvx', args: ['mcp-server-fetch'] },
          _disabled_postgres: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres'],
            env: { POSTGRES_URL: '${POSTGRES_URL}' },
          },
        },
      },
      opts,
    );

    const servers = result.mcpServers as Record<string, { disabled: boolean }>;

    // The one server that works on a clean machine is the only enabled one.
    const enabled = Object.entries(servers)
      .filter(([, v]) => !v.disabled)
      .map(([k]) => k);
    expect(enabled).toEqual(['filesystem']);

    // No legacy keys survive, and nothing needs interpolation at runtime.
    expect(Object.keys(servers).some((k) => k.startsWith('_disabled_'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('${WORKSPACE_ROOT}');
  });

  it('preserves sibling keys outside mcpServers', () => {
    const result = normalizeMCPConfig(
      { someOtherKey: 'keep me', mcpServers: {} },
      opts,
    );
    expect(result.someOtherKey).toBe('keep me');
  });
});
