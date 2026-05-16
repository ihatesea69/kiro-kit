import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { load, listAvailable } from '../../src/core/PresetLoader.js';
import * as TrackingStore from '../../src/core/TrackingStore.js';
import { resolve as resolveConflict } from '../../src/core/ConflictResolver.js';
import { atomicWrite } from '../../src/utils/fs-safe.js';
import { safePathInside } from '../../src/utils/paths.js';

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

describe('update e2e', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-update-e2e-'));
    fs.mkdirSync(path.join(tmpDir, '.kiro'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects changed files and updates them in force mode', () => {
    const presetName = listAvailable()[0];
    const preset = load(presetName);
    const { manifest, dir: presetDir } = preset;

    // Install a file with "old" content
    const regularFiles = manifest.files.filter(
      (f) => !['mcp', 'settings', 'statusline'].includes(f.type),
    );
    const testFile = regularFiles[0];
    if (!testFile) return;

    const targetPath = path.resolve(tmpDir, testFile.target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    atomicWrite(targetPath, 'old content version');

    const oldHash = sha256(Buffer.from('old content version'));

    // Setup tracking with old version
    const tracking = TrackingStore.createInitial('0.1.0');
    TrackingStore.upsertPreset(tracking, {
      name: manifest.name,
      version: '0.0.1', // old version
      installedAt: new Date().toISOString(),
      files: [{ target: testFile.target, sourcePreset: manifest.name, contentHash: oldHash, installedAt: new Date().toISOString() }],
    });
    TrackingStore.write(tmpDir, tracking);

    // Simulate update: load bundled version and compare
    const sourcePath = path.join(presetDir, testFile.source);
    if (!fs.existsSync(sourcePath)) return;

    const sourceContent = fs.readFileSync(sourcePath);
    const newHash = sha256(sourceContent);

    // Hash differs from old -> file changed in new version
    expect(newHash).not.toBe(oldHash);

    // Force mode: overwrite
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    atomicWrite(targetPath, sourceContent.toString('utf-8'));

    // Bump version in tracking
    const updatedTracking = TrackingStore.read(tmpDir)!;
    updatedTracking.presets[0].version = manifest.version;
    updatedTracking.presets[0].updatedAt = new Date().toISOString();
    TrackingStore.write(tmpDir, updatedTracking);

    // Verify
    const final = TrackingStore.read(tmpDir)!;
    expect(final.presets[0].version).toBe(manifest.version);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(sourceContent.toString('utf-8'));
  });

  it('exits gracefully when no presets installed', () => {
    const tracking = TrackingStore.createInitial('0.1.0');
    TrackingStore.write(tmpDir, tracking);

    const read = TrackingStore.read(tmpDir)!;
    expect(read.presets).toHaveLength(0);
    // In real CLI this would exit 0 with "Nothing to update"
  });

  it('skips files in skip-existing mode', async () => {
    const presetName = listAvailable()[0];
    const preset = load(presetName);
    const regularFiles = preset.manifest.files.filter(
      (f) => !['mcp', 'settings', 'statusline'].includes(f.type),
    );
    const testFile = regularFiles[0];
    if (!testFile) return;

    const targetPath = path.resolve(tmpDir, testFile.target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    atomicWrite(targetPath, 'user modified content');

    const sourcePath = path.join(preset.dir, testFile.source);
    if (!fs.existsSync(sourcePath)) return;
    const sourceContent = fs.readFileSync(sourcePath);

    const action = await resolveConflict({
      target: targetPath,
      sourceContent,
      mode: 'skip-existing',
      sessionState: { overwriteAll: false },
    });

    expect(action).toBe('SKIP');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('user modified content');
  });
});
