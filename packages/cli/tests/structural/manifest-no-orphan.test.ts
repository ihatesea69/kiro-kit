import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const presetsDir = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'kiro-kit-dev', 'sa', 'ai-engineer'];

/**
 * Recursively walk a directory and return all file paths relative to `baseDir`.
 */
function walkFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return results;
}

describe('manifest no orphan files', () => {
  for (const preset of PRESETS) {
    it(`${preset}: every physical file has a manifest entry`, () => {
      const presetDir = path.join(presetsDir, preset);
      const manifestPath = path.join(presetDir, 'manifest.json');

      expect(fs.existsSync(manifestPath), `manifest.json missing for ${preset}`).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const entries: Array<{ source: string }> = manifest.files || manifest.entries || [];
      const declaredSources = new Set(entries.map((e) => e.source));

      // Exempt files that are not tracked in manifest
      const EXEMPT = new Set(['manifest.json', 'README.md']);

      const physicalFiles = walkFiles(presetDir, presetDir);
      const orphans: string[] = [];

      for (const file of physicalFiles) {
        if (EXEMPT.has(file)) continue;
        // .gitkeep files are directory placeholders, skip
        if (path.basename(file) === '.gitkeep') continue;
        if (!declaredSources.has(file)) {
          orphans.push(file);
        }
      }

      expect(
        orphans,
        `Orphan files in ${preset} (no manifest entry):\n  ${orphans.slice(0, 20).join('\n  ')}`,
      ).toHaveLength(0);
    });
  }
});
