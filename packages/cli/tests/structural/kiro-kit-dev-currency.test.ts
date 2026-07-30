import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The `kiro-kit-dev` preset is shipped documentation of how this repository is
 * developed and released. It drifts silently: nothing breaks when it goes
 * stale, so nobody notices until someone follows it.
 *
 * It has drifted twice already — it listed six presets when there were nine,
 * and it told people to run `npm publish` by hand months after releases moved
 * to CI, which is the exact route that got 0.10.3 deprecated.
 *
 * These tests cover the parts that can be checked mechanically. They cannot
 * tell whether the prose is *true*, only whether it still refers to the world
 * that exists.
 */

const repoRoot = path.resolve(__dirname, '../../../..');
const presetsDir = path.join(repoRoot, 'presets');
const devPreset = path.join(presetsDir, 'kiro-kit-dev');

function shippedPresets(): string[] {
  return fs
    .readdirSync(presetsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort();
}

describe('kiro-kit-dev stays current', () => {
  const steering = path.join(devPreset, 'steering', 'kiro-kit-development.md');

  it('names every shipped preset in its repository layout', () => {
    const content = fs.readFileSync(steering, 'utf-8');
    const missing = shippedPresets().filter((name) => !content.includes(name));

    expect(
      missing,
      `presets/kiro-kit-dev/steering/kiro-kit-development.md does not mention: ${missing.join(', ')}. ` +
        'Adding a preset means updating the layout section that describes them.',
    ).toHaveLength(0);
  });

  it('states the current preset count', () => {
    const content = fs.readFileSync(steering, 'utf-8');
    const count = shippedPresets().length;

    expect(
      content.includes(`${count} self-contained preset`),
      `The layout section should say "${count} self-contained preset directories" — ` +
        `there are ${count} presets on disk.`,
    ).toBe(true);
  });

  it('does not teach publishing to npm by hand', () => {
    // Releases go through the tag-triggered workflow with an OIDC trusted
    // publisher. A hand-publish skips provenance, and shipped a stale dist
    // once already. Mentioning the command to warn against it is fine; giving
    // it as a step is not.
    const files = [steering, path.join(devPreset, 'commands', 'release.md')];

    const offenders: string[] = [];
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
        const isInstruction = /^\s*(?:[-*]|\d+\.)\s/.test(line) || /^\s*`{3}/.test(line);
        const warnsAgainst = /\bdo not\b|\bnever\b|\binstead of\b|\bnot\b\s+.*\bby hand\b/i.test(line);
        if (isInstruction && /npm publish/.test(line) && !warnsAgainst) {
          offenders.push(`${path.relative(repoRoot, file)}: ${line.trim()}`);
        }
      }
    }

    expect(
      offenders,
      `Releases are published by CI. These lines read as instructions to publish by hand:\n${offenders.join('\n')}`,
    ).toHaveLength(0);
  });
});
