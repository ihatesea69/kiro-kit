import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const presetsDir = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai'];

// Non-skill items that may exist in skills/ directory
const IGNORED_ENTRIES = new Set([
  'README.md', 'INSTALLATION.md', 'THIRD_PARTY_NOTICES.md',
  'agent_skills_spec.md', '.env.example', 'common',
]);

function hasSkillMd(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'SKILL.md')) ||
    fs.existsSync(path.join(dir, 'skill.md'));
}

function isSubSkillContainer(dir: string): boolean {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const subDirs = entries.filter((e) => e.isDirectory());
  return subDirs.some((sub) => hasSkillMd(path.join(dir, sub.name)));
}

describe('skill discoverability', () => {
  for (const preset of PRESETS) {
    describe(`preset: ${preset}`, () => {
      it('every skill folder has SKILL.md or is a sub-skill container', () => {
        const skillsDir = path.join(presetsDir, preset, 'skills');
        if (!fs.existsSync(skillsDir)) {
          expect.fail(`skills/ directory missing for preset ${preset}`);
          return;
        }

        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        const folders = entries.filter(
          (e) => e.isDirectory() && !IGNORED_ENTRIES.has(e.name),
        );

        const violations: string[] = [];
        for (const folder of folders) {
          const folderPath = path.join(skillsDir, folder.name);
          if (!hasSkillMd(folderPath) && !isSubSkillContainer(folderPath)) {
            violations.push(folder.name);
          }
        }

        expect(
          violations,
          `Skill folders without SKILL.md or sub-skills: ${violations.join(', ')}`,
        ).toHaveLength(0);
      });
    });
  }
});
