import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { backup, restore, listTimestamps } from '../../src/core/BackupManager.js';
import { KKError } from '../../src/core/errors.js';

describe('BackupManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-backup-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('backup', () => {
    it('creates backup file at correct path', () => {
      const kiroDir = path.join(tmpDir, '.kiro');
      fs.mkdirSync(kiroDir, { recursive: true });
      const targetFile = path.join(kiroDir, 'settings.json');
      fs.writeFileSync(targetFile, '{"test": true}');

      const ts = backup(tmpDir, targetFile, '20240101-120000-000');

      expect(ts).toBe('20240101-120000-000');
      const backupPath = path.join(tmpDir, '.kiro/.backup/20240101-120000-000/.kiro/settings.json');
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.readFileSync(backupPath, 'utf-8')).toBe('{"test": true}');
    });
  });

  describe('restore', () => {
    it('restores files and content is byte-equal', () => {
      // Create original file
      const kiroDir = path.join(tmpDir, '.kiro');
      fs.mkdirSync(kiroDir, { recursive: true });
      const targetFile = path.join(kiroDir, 'settings.json');
      const originalContent = '{"original": true}';
      fs.writeFileSync(targetFile, originalContent);

      // Backup
      backup(tmpDir, targetFile, '20240101-120000-000');

      // Modify original
      fs.writeFileSync(targetFile, '{"modified": true}');

      // Restore
      const restored = restore(tmpDir, '20240101-120000-000');

      expect(restored.length).toBeGreaterThan(0);
      expect(fs.readFileSync(targetFile, 'utf-8')).toBe(originalContent);
    });
  });

  describe('listTimestamps', () => {
    it('returns timestamps sorted newest first', () => {
      const kiroDir = path.join(tmpDir, '.kiro');
      fs.mkdirSync(kiroDir, { recursive: true });
      const targetFile = path.join(kiroDir, 'test.txt');
      fs.writeFileSync(targetFile, 'data');

      backup(tmpDir, targetFile, '20240101-100000-000');
      backup(tmpDir, targetFile, '20240102-100000-000');
      backup(tmpDir, targetFile, '20240101-200000-000');

      const timestamps = listTimestamps(tmpDir);
      expect(timestamps).toEqual([
        '20240102-100000-000',
        '20240101-200000-000',
        '20240101-100000-000',
      ]);
    });

    it('returns empty array when no backups exist', () => {
      const timestamps = listTimestamps(tmpDir);
      expect(timestamps).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('throws KKError when backup timestamp not found', () => {
      // Create .kiro/.backup dir but no matching timestamp
      const backupDir = path.join(tmpDir, '.kiro/.backup');
      fs.mkdirSync(backupDir, { recursive: true });

      expect(() => restore(tmpDir, 'nonexistent-ts')).toThrow(KKError);
      try {
        restore(tmpDir, 'nonexistent-ts');
      } catch (e) {
        expect((e as KKError).code).toBe('KK050');
      }
    });
  });
});
