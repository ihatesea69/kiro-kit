import fs from 'node:fs';
import path from 'node:path';
import { KKError, ErrorCodes } from './errors.js';

const BACKUP_DIR = '.kiro/.backup';

/**
 * Generate timestamp string: YYYYMMDD-HHmmss-mmm
 */
function generateTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${y}${mo}${d}-${h}${mi}${s}-${ms}`;
}

/**
 * Backup a file to .kiro/.backup/<timestamp>/<relative-path>
 */
export function backup(
  workspaceRoot: string,
  target: string,
  timestamp?: string,
): string {
  const ts = timestamp ?? generateTimestamp();
  const relPath = path.relative(workspaceRoot, target);
  const backupPath = path.join(workspaceRoot, BACKUP_DIR, ts, relPath);
  const backupDir = path.dirname(backupPath);

  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(target, backupPath);

  return ts;
}

/**
 * Restore files from a backup timestamp.
 * If no timestamp given, uses the most recent backup.
 * Returns list of restored file paths.
 */
export function restore(
  workspaceRoot: string,
  timestamp?: string,
): string[] {
  const ts = timestamp ?? getLatestTimestamp(workspaceRoot);

  if (!ts) {
    throw new KKError(
      ErrorCodes.BACKUP_NOT_FOUND,
      'No backup found.',
      'Run kiro-kit init or add first to create backups.',
    );
  }

  const backupRoot = path.join(workspaceRoot, BACKUP_DIR, ts);
  if (!fs.existsSync(backupRoot)) {
    throw new KKError(
      ErrorCodes.BACKUP_NOT_FOUND,
      `Backup timestamp "${ts}" not found.`,
      `Available: ${listTimestamps(workspaceRoot).join(', ') || 'none'}`,
    );
  }

  const restored: string[] = [];

  const walkAndRestore = (dir: string, relPrefix: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walkAndRestore(fullPath, rel);
      } else if (entry.isFile()) {
        const targetPath = path.join(workspaceRoot, rel);
        const targetDir = path.dirname(targetPath);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(fullPath, targetPath);
        restored.push(rel);
      }
    }
  };

  walkAndRestore(backupRoot, '');
  return restored;
}

/**
 * List all backup timestamps sorted newest first.
 */
export function listTimestamps(workspaceRoot: string): string[] {
  const backupBase = path.join(workspaceRoot, BACKUP_DIR);
  if (!fs.existsSync(backupBase)) return [];

  try {
    return fs
      .readdirSync(backupBase, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function getLatestTimestamp(workspaceRoot: string): string | undefined {
  const timestamps = listTimestamps(workspaceRoot);
  return timestamps[0];
}
