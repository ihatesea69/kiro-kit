import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { backup, restore, listTimestamps } from '../../src/core/BackupManager.js';

describe('restore e2e', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-restore-e2e-'));
    fs.mkdirSync(path.join(tmpDir, '.kiro'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('backup -> modify -> restore -> byte-equal with original', () => {
    // Create original files
    const file1 = path.join(tmpDir, '.kiro/settings.json');
    const file2 = path.join(tmpDir, '.kiro/agents/planner.md');
    const original1 = '{"statusLine":{"type":"command","command":"node .kiro/statusline.js"}}';
    const original2 = '---\nname: planner\ndescription: Plans things\n---\nYou are a planner.';

    fs.mkdirSync(path.dirname(file2), { recursive: true });
    fs.writeFileSync(file1, original1);
    fs.writeFileSync(file2, original2);

    // Backup both files
    const ts = '20240615-120000-000';
    backup(tmpDir, file1, ts);
    backup(tmpDir, file2, ts);

    // Modify files
    fs.writeFileSync(file1, '{"modified": true}');
    fs.writeFileSync(file2, 'completely different content');

    // Verify modification
    expect(fs.readFileSync(file1, 'utf-8')).not.toBe(original1);
    expect(fs.readFileSync(file2, 'utf-8')).not.toBe(original2);

    // Restore
    const restored = restore(tmpDir, ts);

    // Verify byte-equal
    expect(fs.readFileSync(file1, 'utf-8')).toBe(original1);
    expect(fs.readFileSync(file2, 'utf-8')).toBe(original2);
    expect(restored.length).toBe(2);
  });

  it('restore uses latest timestamp when none specified', () => {
    const file = path.join(tmpDir, '.kiro/test.txt');
    fs.writeFileSync(file, 'v1');
    backup(tmpDir, file, '20240101-100000-000');

    fs.writeFileSync(file, 'v2');
    backup(tmpDir, file, '20240102-100000-000');

    fs.writeFileSync(file, 'v3-modified');

    // Restore without specifying timestamp -> uses latest (20240102)
    restore(tmpDir);
    expect(fs.readFileSync(file, 'utf-8')).toBe('v2');
  });

  it('backup is preserved after restore (idempotent)', () => {
    const file = path.join(tmpDir, '.kiro/data.json');
    fs.writeFileSync(file, '{"original": true}');

    const ts = '20240101-120000-000';
    backup(tmpDir, file, ts);
    fs.writeFileSync(file, '{"changed": true}');

    restore(tmpDir, ts);

    // Backup still exists
    const timestamps = listTimestamps(tmpDir);
    expect(timestamps).toContain(ts);

    // Can restore again (idempotent)
    fs.writeFileSync(file, '{"changed again": true}');
    restore(tmpDir, ts);
    expect(fs.readFileSync(file, 'utf-8')).toBe('{"original": true}');
  });

  it('throws when no backups exist', () => {
    expect(() => restore(tmpDir)).toThrow();
  });
});
