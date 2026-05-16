import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getCommand, install } from '../../src/core/StatuslineSelector.js';

describe('StatuslineSelector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-statusline-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getCommand', () => {
    it('returns a command string based on platform', () => {
      const cmd = getCommand();
      expect(typeof cmd).toBe('string');
      expect(cmd.length).toBeGreaterThan(0);

      if (process.platform === 'win32') {
        expect(cmd).toContain('powershell');
        expect(cmd).toContain('statusline.ps1');
      } else {
        expect(cmd).toContain('node');
        expect(cmd).toContain('statusline.js');
      }
    });
  });

  describe('install', () => {
    it('produces 3 statusline files when all sources exist', () => {
      // Create source preset dir with all 3 files
      const presetDir = path.join(tmpDir, 'preset');
      fs.mkdirSync(presetDir, { recursive: true });
      fs.writeFileSync(path.join(presetDir, 'statusline.js'), '#!/usr/bin/env node\nconsole.log("js");');
      fs.writeFileSync(path.join(presetDir, 'statusline.sh'), '#!/bin/bash\necho "sh"');
      fs.writeFileSync(path.join(presetDir, 'statusline.ps1'), 'Write-Output "ps1"');

      const workspaceRoot = path.join(tmpDir, 'workspace');
      fs.mkdirSync(workspaceRoot, { recursive: true });

      const installed = install(presetDir, workspaceRoot);

      expect(installed).toHaveLength(3);
      expect(installed).toContain('.kiro/statusline.js');
      expect(installed).toContain('.kiro/statusline.sh');
      expect(installed).toContain('.kiro/statusline.ps1');

      // Verify files exist
      expect(fs.existsSync(path.join(workspaceRoot, '.kiro/statusline.js'))).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, '.kiro/statusline.sh'))).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, '.kiro/statusline.ps1'))).toBe(true);
    });

    it('skips files that do not exist in preset', () => {
      const presetDir = path.join(tmpDir, 'preset');
      fs.mkdirSync(presetDir, { recursive: true });
      // Only create .js file
      fs.writeFileSync(path.join(presetDir, 'statusline.js'), 'console.log("js");');

      const workspaceRoot = path.join(tmpDir, 'workspace');
      fs.mkdirSync(workspaceRoot, { recursive: true });

      const installed = install(presetDir, workspaceRoot);

      expect(installed).toHaveLength(1);
      expect(installed).toContain('.kiro/statusline.js');
    });
  });
});
