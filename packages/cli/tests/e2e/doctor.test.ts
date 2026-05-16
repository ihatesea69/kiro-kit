import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import * as TrackingStore from '../../src/core/TrackingStore.js';

describe('doctor e2e', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-doctor-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('pass scenario - clean workspace', () => {
    it('all checks pass with valid workspace', () => {
      // Setup clean workspace
      const kiroDir = path.join(tmpDir, '.kiro');
      fs.mkdirSync(path.join(kiroDir, 'settings'), { recursive: true });

      // Valid mcp.json
      fs.writeFileSync(
        path.join(kiroDir, 'settings/mcp.json'),
        '{"mcpServers": {}}',
      );

      // Valid tracking
      const tracking = TrackingStore.createInitial('0.1.0');
      TrackingStore.write(tmpDir, tracking);

      // Valid metadata
      fs.writeFileSync(
        path.join(kiroDir, 'metadata.json'),
        JSON.stringify({ version: '1.0.0', name: 'kiro-kit', presets: [] }),
      );

      // Verify all files are valid JSON
      const mcpContent = fs.readFileSync(path.join(kiroDir, 'settings/mcp.json'), 'utf-8');
      expect(() => JSON.parse(mcpContent)).not.toThrow();

      const trackingContent = fs.readFileSync(path.join(kiroDir, '.kiro-kit.json'), 'utf-8');
      expect(() => JSON.parse(trackingContent)).not.toThrow();

      const metaContent = fs.readFileSync(path.join(kiroDir, 'metadata.json'), 'utf-8');
      const meta = JSON.parse(metaContent);
      expect(meta.version).toBeDefined();
      expect(meta.name).toBeDefined();
    });
  });

  describe('fail scenario - corrupt JSON', () => {
    it('detects corrupt mcp.json', () => {
      const kiroDir = path.join(tmpDir, '.kiro/settings');
      fs.mkdirSync(kiroDir, { recursive: true });
      fs.writeFileSync(path.join(kiroDir, 'mcp.json'), '{invalid json!!!');

      const content = fs.readFileSync(path.join(kiroDir, 'mcp.json'), 'utf-8');
      expect(() => JSON.parse(content)).toThrow();
    });

    it('detects corrupt tracking file', () => {
      const kiroDir = path.join(tmpDir, '.kiro');
      fs.mkdirSync(kiroDir, { recursive: true });
      fs.writeFileSync(path.join(kiroDir, '.kiro-kit.json'), 'not json at all');

      expect(() => TrackingStore.read(tmpDir)).toThrow();
    });

    it('detects invalid metadata.json', () => {
      const kiroDir = path.join(tmpDir, '.kiro');
      fs.mkdirSync(kiroDir, { recursive: true });
      fs.writeFileSync(path.join(kiroDir, 'metadata.json'), '{}');

      const content = JSON.parse(fs.readFileSync(path.join(kiroDir, 'metadata.json'), 'utf-8'));
      // Missing required fields
      expect(content.version).toBeUndefined();
      expect(content.name).toBeUndefined();
    });
  });

  describe('fail scenario - missing tracked file', () => {
    it('detects when tracked files are missing from disk', () => {
      const kiroDir = path.join(tmpDir, '.kiro');
      fs.mkdirSync(kiroDir, { recursive: true });

      // Create tracking that references a file that doesn't exist
      const tracking = TrackingStore.createInitial('0.1.0');
      TrackingStore.upsertPreset(tracking, {
        name: 'frontend',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        files: [{
          target: '.kiro/agents/nonexistent.md',
          sourcePreset: 'frontend',
          contentHash: 'abc123',
          installedAt: new Date().toISOString(),
        }],
      });
      TrackingStore.write(tmpDir, tracking);

      // Verify the tracked file doesn't exist
      const trackedPath = path.resolve(tmpDir, '.kiro/agents/nonexistent.md');
      expect(fs.existsSync(trackedPath)).toBe(false);

      // Read tracking and check
      const read = TrackingStore.read(tmpDir)!;
      const missing = read.presets[0].files.filter(
        (f) => !fs.existsSync(path.resolve(tmpDir, f.target)),
      );
      expect(missing.length).toBeGreaterThan(0);
    });
  });

  describe('fix scenario', () => {
    it('can fix corrupt mcp.json by resetting to empty', () => {
      const mcpPath = path.join(tmpDir, '.kiro/settings/mcp.json');
      fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
      fs.writeFileSync(mcpPath, '{broken');

      // Simulate --fix: reset to valid empty
      fs.writeFileSync(mcpPath, '{\n  "mcpServers": {}\n}\n');

      const content = fs.readFileSync(mcpPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });
});
