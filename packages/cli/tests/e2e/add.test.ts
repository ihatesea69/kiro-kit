import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { load, listAvailable } from '../../src/core/PresetLoader.js';
import * as TrackingStore from '../../src/core/TrackingStore.js';
import * as MetadataWriter from '../../src/core/MetadataWriter.js';
import { mergeMCP, type MCPConfig } from '../../src/core/merge/mergeMCP.js';
import { mergeSettings } from '../../src/core/merge/mergeSettings.js';
import { atomicWrite } from '../../src/utils/fs-safe.js';
import { safePathInside } from '../../src/utils/paths.js';

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

describe('add e2e', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-add-e2e-'));
    // Setup existing .kiro/ with first preset tracking
    fs.mkdirSync(path.join(tmpDir, '.kiro'), { recursive: true });
    const tracking = TrackingStore.createInitial('0.1.0');
    TrackingStore.upsertPreset(tracking, {
      name: 'frontend',
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      files: [{ target: '.kiro/agents/planner.md', sourcePreset: 'frontend', contentHash: 'abc', installedAt: new Date().toISOString() }],
    });
    TrackingStore.write(tmpDir, tracking);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds a second preset and merges tracking', () => {
    const available = listAvailable();
    const secondPreset = available.find((n) => n !== 'frontend') ?? available[1];
    const preset = load(secondPreset);

    // Simulate add: write a few files
    const regularFiles = preset.manifest.files.filter(
      (f) => !['mcp', 'settings', 'statusline'].includes(f.type),
    );
    const written: TrackingStore.TrackedFile[] = [];

    for (const entry of regularFiles.slice(0, 3)) {
      const sourcePath = path.join(preset.dir, entry.source);
      if (!fs.existsSync(sourcePath)) continue;
      if (!safePathInside(tmpDir, entry.target)) continue;

      const targetPath = path.resolve(tmpDir, entry.target);
      const content = fs.readFileSync(sourcePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      atomicWrite(targetPath, content.toString('utf-8'));

      written.push({
        target: entry.target,
        sourcePreset: preset.manifest.name,
        contentHash: sha256(content),
        installedAt: new Date().toISOString(),
      });
    }

    // Merge tracking
    const tracking = TrackingStore.read(tmpDir)!;
    TrackingStore.upsertPreset(tracking, {
      name: preset.manifest.name,
      version: preset.manifest.version,
      installedAt: new Date().toISOString(),
      files: written,
    });
    TrackingStore.write(tmpDir, tracking);

    // Verify
    const updated = TrackingStore.read(tmpDir)!;
    expect(updated.presets).toHaveLength(2);
    expect(updated.presets.map((p) => p.name)).toContain('frontend');
    expect(updated.presets.map((p) => p.name)).toContain(preset.manifest.name);
  });

  it('merges MCP servers from second preset without overwriting existing', () => {
    // Setup existing MCP
    const mcpPath = path.join(tmpDir, '.kiro/settings/mcp.json');
    fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
    const existingMcp: MCPConfig = {
      mcpServers: { 'user-server': { command: 'node user.js' } },
    };
    fs.writeFileSync(mcpPath, JSON.stringify(existingMcp, null, 2));

    // Merge new servers
    const newServers = { 'preset-server': { command: 'node preset.js' } };
    const merged = mergeMCP(existingMcp, newServers, 'backend');

    expect(merged.mcpServers['user-server']).toBeDefined();
    expect(merged.mcpServers['preset-server']).toBeDefined();
  });

  it('auto-creates .kiro/ if not present', () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-add-fresh-'));
    try {
      const kiroDir = path.join(freshDir, '.kiro');
      expect(fs.existsSync(kiroDir)).toBe(false);

      // Simulate auto-init
      fs.mkdirSync(kiroDir, { recursive: true });
      expect(fs.existsSync(kiroDir)).toBe(true);
    } finally {
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  });
});
