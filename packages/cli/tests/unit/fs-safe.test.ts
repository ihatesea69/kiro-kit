import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { atomicWrite } from '../../src/utils/fs-safe.js';

describe('fs-safe (atomicWrite)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-fssafe-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('line endings for .json/.yaml', () => {
    it('uses LF for .json files', () => {
      const target = path.join(tmpDir, 'test.json');
      const content = '{\n  "key": "value"\r\n}\r\n';

      atomicWrite(target, content);

      const result = fs.readFileSync(target, 'utf-8');
      expect(result).not.toContain('\r\n');
      expect(result).toContain('\n');
    });

    it('uses LF for .yaml files', () => {
      const target = path.join(tmpDir, 'test.yaml');
      const content = 'key: value\r\nother: data\r\n';

      atomicWrite(target, content);

      const result = fs.readFileSync(target, 'utf-8');
      expect(result).not.toContain('\r\n');
      expect(result).toContain('\n');
    });
  });

  describe('line endings for .md/.sh/.ps1', () => {
    it('uses OS-default line endings for .md files', () => {
      const target = path.join(tmpDir, 'readme.md');
      const content = 'line1\nline2\nline3\n';

      atomicWrite(target, content);

      const result = fs.readFileSync(target, 'utf-8');
      if (os.EOL === '\r\n') {
        expect(result).toContain('\r\n');
      } else {
        expect(result).not.toContain('\r\n');
      }
    });

    it('uses OS-default line endings for .sh files', () => {
      const target = path.join(tmpDir, 'script.sh');
      const content = '#!/bin/bash\necho hello\n';

      atomicWrite(target, content);

      const result = fs.readFileSync(target, 'utf-8');
      if (os.EOL === '\r\n') {
        expect(result).toContain('\r\n');
      } else {
        expect(result).not.toContain('\r\n');
      }
    });

    it('uses OS-default line endings for .ps1 files', () => {
      const target = path.join(tmpDir, 'script.ps1');
      const content = 'Write-Output "hello"\nWrite-Output "world"\n';

      atomicWrite(target, content);

      const result = fs.readFileSync(target, 'utf-8');
      if (os.EOL === '\r\n') {
        expect(result).toContain('\r\n');
      } else {
        expect(result).not.toContain('\r\n');
      }
    });
  });

  describe('atomic rename', () => {
    it('file exists after write (no partial state)', () => {
      const target = path.join(tmpDir, 'atomic.json');
      const content = '{"atomic": true}';

      atomicWrite(target, content);

      expect(fs.existsSync(target)).toBe(true);
      const result = fs.readFileSync(target, 'utf-8');
      expect(result).toContain('"atomic"');
    });

    it('creates parent directories if needed', () => {
      const target = path.join(tmpDir, 'nested', 'deep', 'file.json');
      const content = '{"nested": true}';

      atomicWrite(target, content);

      expect(fs.existsSync(target)).toBe(true);
    });

    it('no temp files left behind after successful write', () => {
      const target = path.join(tmpDir, 'clean.json');
      atomicWrite(target, '{"clean": true}');

      const files = fs.readdirSync(tmpDir);
      const tmpFiles = files.filter((f) => f.startsWith('.tmp.'));
      expect(tmpFiles).toHaveLength(0);
    });
  });
});
