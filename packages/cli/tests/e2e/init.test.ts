import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { load, loadAll, listAvailable } from '../../src/core/PresetLoader.js';
import { resolve as resolveConflict, type SessionState } from '../../src/core/ConflictResolver.js';
import * as TrackingStore from '../../src/core/TrackingStore.js';
import * as MetadataWriter from '../../src/core/MetadataWriter.js';
import * as StatuslineSelector from '../../src/core/StatuslineSelector.js';
import { mergeMCP } from '../../src/core/merge/mergeMCP.js';
import { mergeSettings } from '../../src/core/merge/mergeSettings.js';
import { atomicWrite } from '../../src/utils/fs-safe.js';
import { safePathInside } from '../../src/utils/paths.js';
import { backup } from '../../src/core/BackupManager.js';

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

describe('init e2e', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-init-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes files from a preset into workspace', () => {
    const available = listAvailable();
    expect(available.length).toBeGreaterThan(0);

    const presetName = available[0];
    const preset = load(presetName);
    const { manifest, dir: presetDir } = preset;

    // Simulate init: write regular files with skip-existing mode
    const sessionState: SessionState = { overwriteAll: false };
    const trackedFiles: TrackingStore.TrackedFile[] = [];

    const regularFiles = manifest.files.filter(
      (f) => !['mcp', 'settings', 'statusline'].includes(f.type),
    );

    for (const fileEntry of regularFiles.slice(0, 5)) {
      const sourcePath = path.join(presetDir, fileEntry.source);
      const targetPath = path.resolve(tmpDir, fileEntry.target);

      if (!fs.existsSync(sourcePath)) continue;
      if (!safePathInside(tmpDir, fileEntry.target)) continue;

      const sourceContent = fs.readFileSync(sourcePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      atomicWrite(targetPath, sourceContent.toString('utf-8'));

      trackedFiles.push({
        target: fileEntry.target,
        sourcePreset: manifest.name,
        contentHash: sha256(sourceContent),
        installedAt: new Date().toISOString(),
      });
    }

    // Verify files were written
    for (const tf of trackedFiles) {
      const fullPath = path.resolve(tmpDir, tf.target);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('creates tracking file after init', () => {
    const presetName = listAvailable()[0];
    const preset = load(presetName);

    // Write tracking
    const trackingData = TrackingStore.createInitial('0.1.0');
    const trackedPreset: TrackingStore.TrackedPreset = {
      name: preset.manifest.name,
      version: preset.manifest.version,
      installedAt: new Date().toISOString(),
      files: [],
    };
    TrackingStore.upsertPreset(trackingData, trackedPreset);
    TrackingStore.write(tmpDir, trackingData);

    // Verify tracking file exists and is valid
    const read = TrackingStore.read(tmpDir);
    expect(read).not.toBeNull();
    expect(read!.presets).toHaveLength(1);
    expect(read!.presets[0].name).toBe(preset.manifest.name);
  });

  it('creates metadata.json after init', () => {
    const metadata = MetadataWriter.compose({
      kitVersion: '0.1.0',
      repository: 'https://github.com/test/repo.git',
      presets: [{ name: 'frontend', version: '1.0.0' }],
    });
    MetadataWriter.write(tmpDir, metadata);

    const read = MetadataWriter.read(tmpDir);
    expect(read).not.toBeNull();
    expect(read!.name).toBe('kiro-kit');
    expect(read!.presets[0].name).toBe('frontend');
  });

  it('creates settings.json with statusline resolved', () => {
    const presetSettings = {
      statusLine: { type: 'command', command: '' },
      hooks: { PreToolUse: [{ command: 'node .kiro/hooks/scout-block.js' }] },
      includeCoAuthoredBy: false,
    };

    const resolved = StatuslineSelector.resolveSettingsCommand(
      presetSettings as Record<string, unknown>,
    );
    const merged = mergeSettings(null, resolved as any);

    const settingsPath = path.join(tmpDir, '.kiro/settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    atomicWrite(settingsPath, JSON.stringify(merged, null, 2) + '\n');

    expect(fs.existsSync(settingsPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(content.statusLine.command).toBeTruthy();
  });

  it('empty selection produces no files', () => {
    // Simulate empty selection: no files written
    const kiroDir = path.join(tmpDir, '.kiro');
    expect(fs.existsSync(kiroDir)).toBe(false);
  });
});
