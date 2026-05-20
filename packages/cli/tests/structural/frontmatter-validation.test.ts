import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const presetsDir = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'qa-automation'];

function extractFrontMatter(content: string): Record<string, string> | null {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) return null;

  const fm: Record<string, string> = {};
  for (let i = 1; i < endIdx; i++) {
    const match = lines[i].match(/^(\w[\w-]*):\s*(.+)/);
    if (match) fm[match[1]] = match[2].trim();
  }
  return fm;
}

function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) results.push(full);
    }
  };
  walk(dir);
  return results;
}

function getRelativeNesting(filePath: string, baseDir: string): number {
  const rel = path.relative(baseDir, filePath);
  return rel.split(path.sep).length - 1; // subtract the filename itself
}

describe('frontmatter validation', () => {
  for (const preset of PRESETS) {
    describe(`preset: ${preset}`, () => {
      it('all agent files have name + description in front-matter', () => {
        const agentsDir = path.join(presetsDir, preset, 'agents');
        const files = collectMdFiles(agentsDir);
        const violations: string[] = [];

        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          const fm = extractFrontMatter(content);
          if (!fm || !fm['name'] || !fm['description']) {
            violations.push(path.relative(presetsDir, file));
          }
        }

        expect(
          violations,
          `Agents missing name/description: ${violations.join(', ')}`,
        ).toHaveLength(0);
      });

      it('all command files have description in front-matter', () => {
        const commandsDir = path.join(presetsDir, preset, 'commands');
        const files = collectMdFiles(commandsDir);
        const violations: string[] = [];

        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          const fm = extractFrontMatter(content);
          if (!fm || !fm['description']) {
            violations.push(path.relative(presetsDir, file));
          }
        }

        expect(
          violations,
          `Commands missing description: ${violations.join(', ')}`,
        ).toHaveLength(0);
      });

      it('command path nesting <= 3 levels', () => {
        const commandsDir = path.join(presetsDir, preset, 'commands');
        const files = collectMdFiles(commandsDir);
        const violations: string[] = [];

        for (const file of files) {
          const nesting = getRelativeNesting(file, commandsDir);
          if (nesting > 3) {
            violations.push(`${path.relative(presetsDir, file)} (depth: ${nesting})`);
          }
        }

        expect(
          violations,
          `Commands with nesting > 3: ${violations.join(', ')}`,
        ).toHaveLength(0);
      });
    });
  }
});
