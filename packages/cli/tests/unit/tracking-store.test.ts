import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  read,
  write,
  createInitial,
  upsertPreset,
  getPreset,
  type TrackingData,
} from '../../src/core/TrackingStore.js';
import { KKError } from '../../src/core/errors.js';

describe('TrackingStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-tracking-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('write/read round-trip', () => {
    it('writes and reads back identical data', () => {
      const data = createInitial('1.0.0');
      data.presets.push({
        name: 'frontend',
        version: '1.0.0',
        installedAt: '2024-01-01T00:00:00.000Z',
        files: [
          {
            target: '.kiro/agents/code-reviewer.md',
            sourcePreset: 'frontend',
            contentHash: 'abc123',
            installedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      write(tmpDir, data);
      const readBack = read(tmpDir);

      expect(readBack).not.toBeNull();
      expect(readBack!.kitVersion).toBe('1.0.0');
      expect(readBack!.presets).toHaveLength(1);
      expect(readBack!.presets[0].name).toBe('frontend');
      expect(readBack!.presets[0].files[0].contentHash).toBe('abc123');
    });
  });

  describe('corrupt detection', () => {
    it('throws KKError with KK040 for corrupt JSON', () => {
      const kiroDir = path.join(tmpDir, '.kiro');
      fs.mkdirSync(kiroDir, { recursive: true });
      fs.writeFileSync(
        path.join(kiroDir, '.kiro-kit.json'),
        '{ invalid json content !!!',
      );

      expect(() => read(tmpDir)).toThrow(KKError);
      try {
        read(tmpDir);
      } catch (e) {
        expect((e as KKError).code).toBe('KK040');
      }
    });
  });

  describe('partial state', () => {
    it('returns null when tracking file does not exist', () => {
      const result = read(tmpDir);
      expect(result).toBeNull();
    });
  });

  describe('version bump via upsertPreset', () => {
    it('updates existing preset version', () => {
      const data = createInitial('1.0.0');
      upsertPreset(data, {
        name: 'frontend',
        version: '1.0.0',
        installedAt: '2024-01-01T00:00:00.000Z',
        files: [],
      });

      expect(getPreset(data, 'frontend')!.version).toBe('1.0.0');

      upsertPreset(data, {
        name: 'frontend',
        version: '2.0.0',
        installedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-06-01T00:00:00.000Z',
        files: [],
      });

      expect(data.presets).toHaveLength(1);
      expect(getPreset(data, 'frontend')!.version).toBe('2.0.0');
      expect(data.updatedAt).toBeTruthy();
    });
  });
});
