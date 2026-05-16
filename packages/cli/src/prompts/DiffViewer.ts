import fs from 'node:fs';
import { createTwoFilesPatch } from 'diff';
import { color } from '../utils/color.js';

/**
 * Print a unified diff between the existing file on disk and new source content.
 * Highlights additions in green and deletions in red (NO_COLOR aware).
 */
export function showDiff(target: string, sourceContent: Buffer): void {
  const existing = fs.existsSync(target)
    ? fs.readFileSync(target, 'utf-8')
    : '';
  const incoming = sourceContent.toString('utf-8');

  const patch = createTwoFilesPatch(
    `a/${target}`,
    `b/${target}`,
    existing,
    incoming,
    'current',
    'incoming',
    { context: 3 },
  );

  const lines = patch.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      process.stdout.write(color.green(line) + '\n');
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      process.stdout.write(color.red(line) + '\n');
    } else if (line.startsWith('@@')) {
      process.stdout.write(color.cyan(line) + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}
