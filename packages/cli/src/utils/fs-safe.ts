import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

/** Extensions that should always use LF line endings. */
const LF_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

/**
 * Determine the appropriate line ending for a file based on extension.
 * - .json, .yaml, .yml -> LF
 * - Everything else -> OS default (CRLF on Windows, LF elsewhere)
 */
function getLineEnding(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (LF_EXTENSIONS.has(ext)) return '\n';
  return os.EOL;
}

/**
 * Normalize line endings in content based on target file extension.
 */
function normalizeLineEndings(content: string, filePath: string): string {
  const eol = getLineEnding(filePath);
  // First normalize all to LF, then convert to target
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (eol === '\n') return normalized;
  return normalized.replace(/\n/g, eol);
}

/**
 * Atomic write: writes to a temp file in the same directory, then renames.
 * This ensures the target file is never in a partial state.
 * Also normalizes line endings based on file extension.
 */
export function atomicWrite(target: string, content: string | Buffer): void {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });

  const rand = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.join(dir, `.tmp.${rand}`);

  let data: Buffer;
  if (typeof content === 'string') {
    const normalized = normalizeLineEndings(content, target);
    data = Buffer.from(normalized, 'utf-8');
  } else {
    data = content;
  }

  try {
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, target);
  } catch (err) {
    // Clean up temp file on failure
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}
