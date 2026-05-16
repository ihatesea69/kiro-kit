import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

import { load } from '../core/PresetLoader.js';
import { resolve as resolveConflict, type ConflictMode, type SessionState } from '../core/ConflictResolver.js';
import { backup } from '../core/BackupManager.js';
import * as TrackingStore from '../core/TrackingStore.js';
import { showDiff } from '../prompts/DiffViewer.js';
import { atomicWrite } from '../utils/fs-safe.js';
import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';
import { safePathInside } from '../utils/paths.js';

interface UpdateOptions {
  yes?: boolean;
  force?: boolean;
  skipExisting?: boolean;
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

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

function getKitVersion(): string {
  try {
    const pkgPath = new URL('../../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

async function conflictPrompt(
  target: string,
): Promise<'overwrite' | 'skip' | 'view-diff' | 'overwrite-all'> {
  if (!process.stdin.isTTY) return 'skip';

  const { default: readline } = await import('node:readline');
  const relTarget = path.relative(process.cwd(), target);
  process.stdout.write(
    `\n${color.yellow('?')} File ${color.bold(relTarget)} has changed in the new version.\n` +
      `  ${color.cyan('>')} overwrite       - Replace with new version (backup saved)\n` +
      `    skip            - Keep current file\n` +
      `    view diff       - Show unified diff and ask again\n` +
      `    overwrite all   - Replace all remaining changed files\n`,
  );

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  Choice (overwrite/skip/diff/all): `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'o' || a === 'overwrite') resolve('overwrite');
      else if (a === 's' || a === 'skip') resolve('skip');
      else if (a === 'd' || a === 'diff' || a === 'view diff') resolve('view-diff');
      else if (a === 'a' || a === 'all' || a === 'overwrite all') resolve('overwrite-all');
      else resolve('skip');
    });
  });
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Update installed presets to latest bundled version')
    .option('-y, --yes', 'Skip confirmation, auto-skip conflicts')
    .option('--force', 'Overwrite all changed files (with backup)')
    .option('--skip-existing', 'Skip all changed files')
    .action(async (opts: UpdateOptions) => {
      try {
        await runUpdate(opts);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

async function runUpdate(opts: UpdateOptions): Promise<void> {
  const workspaceRoot = process.cwd();

  // Read tracking
  const tracking = TrackingStore.read(workspaceRoot);
  if (!tracking || tracking.presets.length === 0) {
    logger.info('No presets installed. Nothing to update.');
    process.exit(0);
  }

  let mode: ConflictMode = 'interactive';
  if (opts.force) mode = 'force';
  else if (opts.skipExisting) mode = 'skip-existing';
  else if (opts.yes) mode = 'skip-existing';

  const sessionState: SessionState = { overwriteAll: false };
  const timestamp = generateTimestamp();
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const trackedPreset of tracking.presets) {
    let bundled;
    try {
      bundled = load(trackedPreset.name);
    } catch {
      logger.warn(`Preset "${trackedPreset.name}" not found in bundled presets. Skipping.`);
      continue;
    }

    const bundledVersion = bundled.manifest.version;
    if (bundledVersion === trackedPreset.version) {
      logger.debug(`Preset "${trackedPreset.name}" is up to date (v${bundledVersion}).`);
      continue;
    }

    logger.info(
      `Updating ${color.bold(trackedPreset.name)}: v${trackedPreset.version} -> v${bundledVersion}`,
    );

    // Find changed files by comparing content hashes
    const presetDir = bundled.dir;
    const updatedFiles: TrackingStore.TrackedFile[] = [];

    for (const fileEntry of bundled.manifest.files) {
      if (['mcp', 'settings', 'statusline'].includes(fileEntry.type)) continue;

      const sourcePath = path.join(presetDir, fileEntry.source);
      const targetPath = path.resolve(workspaceRoot, fileEntry.target);

      if (!safePathInside(workspaceRoot, fileEntry.target)) continue;
      if (!fs.existsSync(sourcePath)) continue;

      const sourceContent = fs.readFileSync(sourcePath);
      const newHash = sha256(sourceContent);

      // Check if file changed from what we installed
      const trackedFile = trackedPreset.files.find((f) => f.target === fileEntry.target);
      if (trackedFile && trackedFile.contentHash === newHash) {
        // Bundled file hasn't changed since last install
        continue;
      }

      // File has changed in the new version - resolve conflict
      const action = await resolveConflict({
        target: targetPath,
        sourceContent,
        mode,
        sessionState,
        prompt: conflictPrompt,
        showDiff: (t, s) => showDiff(t, s),
      });

      switch (action) {
        case 'WRITE_NEW':
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          atomicWrite(targetPath, sourceContent.toString('utf-8'));
          if (fileEntry.executable && process.platform !== 'win32') {
            try { fs.chmodSync(targetPath, 0o755); } catch { /* */ }
          }
          totalUpdated++;
          break;
        case 'OVERWRITE_WITH_BACKUP':
          backup(workspaceRoot, targetPath, timestamp);
          atomicWrite(targetPath, sourceContent.toString('utf-8'));
          if (fileEntry.executable && process.platform !== 'win32') {
            try { fs.chmodSync(targetPath, 0o755); } catch { /* */ }
          }
          totalUpdated++;
          break;
        case 'SKIP':
          totalSkipped++;
          break;
        case 'NO_OP':
          break;
      }

      updatedFiles.push({
        target: fileEntry.target,
        sourcePreset: bundled.manifest.name,
        contentHash: newHash,
        installedAt: new Date().toISOString(),
      });
    }

    // Bump version in tracking
    trackedPreset.version = bundledVersion;
    trackedPreset.updatedAt = new Date().toISOString();
    // Update file hashes for changed files
    for (const uf of updatedFiles) {
      const idx = trackedPreset.files.findIndex((f) => f.target === uf.target);
      if (idx >= 0) {
        trackedPreset.files[idx] = uf;
      } else {
        trackedPreset.files.push(uf);
      }
    }
  }

  // Write updated tracking
  tracking.kitVersion = getKitVersion();
  tracking.updatedAt = new Date().toISOString();
  TrackingStore.write(workspaceRoot, tracking);

  if (totalUpdated === 0 && totalSkipped === 0) {
    logger.success('All presets are up to date.');
  } else {
    logger.success(`Update complete: ${totalUpdated} files updated, ${totalSkipped} skipped.`);
  }
}
