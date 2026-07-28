import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const presetsDir = path.resolve(__dirname, '../../../../presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'kiro-kit-dev', 'sa', 'ai-engineer'];

describe('manifest no broken links', () => {
  for (const preset of PRESETS) {
    it(`${preset}: every manifest entry points to an existing file`, () => {
      const presetDir = path.join(presetsDir, preset);
      const manifestPath = path.join(presetDir, 'manifest.json');

      expect(fs.existsSync(manifestPath), `manifest.json missing for ${preset}`).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const entries: Array<{ source: string; target: string; type: string }> =
        manifest.files || manifest.entries || [];

      const brokenLinks: string[] = [];

      for (const entry of entries) {
        if (!entry.source || typeof entry.source !== 'string') {
          brokenLinks.push(`[invalid entry] missing source field`);
          continue;
        }

        const filePath = path.join(presetDir, entry.source);
        if (!fs.existsSync(filePath)) {
          brokenLinks.push(entry.source);
        } else {
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) {
            brokenLinks.push(`${entry.source} (not a file)`);
          }
        }
      }

      expect(
        brokenLinks,
        `Broken links in ${preset} manifest:\n  ${brokenLinks.slice(0, 20).join('\n  ')}`,
      ).toHaveLength(0);
    });
  }
});
