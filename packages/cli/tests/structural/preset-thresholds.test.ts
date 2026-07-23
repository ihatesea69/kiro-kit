import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const presetsDir = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'kiro-kit-dev'];

function countMdFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(d, entry.name));
      else if (entry.isFile() && entry.name.endsWith('.md')) count++;
    }
  };
  walk(dir);
  return count;
}

function countSkillFolders(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(dir, entry.name);
    // A skill folder has SKILL.md or contains sub-folders with SKILL.md
    const hasSkillMd = fs.existsSync(path.join(skillDir, 'SKILL.md')) ||
      fs.existsSync(path.join(skillDir, 'skill.md'));
    const hasSubSkills = fs.readdirSync(skillDir, { withFileTypes: true })
      .some((e) => e.isDirectory() && (
        fs.existsSync(path.join(skillDir, e.name, 'SKILL.md')) ||
        fs.existsSync(path.join(skillDir, e.name, 'skill.md'))
      ));
    if (hasSkillMd || hasSubSkills) count++;
  }
  return count;
}

function countHookSets(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  return files.length;
}

function countWorkflows(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
}

describe('preset thresholds', () => {
  for (const preset of PRESETS) {
    describe(`preset: ${preset}`, () => {
      const presetDir = path.join(presetsDir, preset);

      it('has >= 16 agents', () => {
        const agentsDir = path.join(presetDir, 'agents');
        const count = countMdFiles(agentsDir);
        expect(count).toBeGreaterThanOrEqual(16);
      });

      it('has >= 22 skills', () => {
        const skillsDir = path.join(presetDir, 'skills');
        const count = countSkillFolders(skillsDir);
        expect(count).toBeGreaterThanOrEqual(22);
      });

      it('has >= 40 commands', () => {
        const commandsDir = path.join(presetDir, 'commands');
        const count = countMdFiles(commandsDir);
        expect(count).toBeGreaterThanOrEqual(40);
      });

      it('has >= 6 hooks', () => {
        const hooksDir = path.join(presetDir, 'hooks');
        const count = countHookSets(hooksDir);
        expect(count).toBeGreaterThanOrEqual(6);
      });

      it('has >= 4 workflows', () => {
        const workflowsDir = path.join(presetDir, 'workflows');
        const count = countWorkflows(workflowsDir);
        expect(count).toBeGreaterThanOrEqual(4);
      });
    });
  }
});
