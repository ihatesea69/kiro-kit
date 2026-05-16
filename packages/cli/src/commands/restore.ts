import { Command } from 'commander';
import process from 'node:process';

import { restore, listTimestamps } from '../core/BackupManager.js';
import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';

interface RestoreOptions {
  timestamp?: string;
  list?: boolean;
}

export function registerRestoreCommand(program: Command): void {
  program
    .command('restore')
    .description('Restore files from backup')
    .option('--timestamp <ts>', 'Restore from specific backup timestamp')
    .option('--list', 'List available backup timestamps')
    .action((opts: RestoreOptions) => {
      try {
        runRestore(opts);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function runRestore(opts: RestoreOptions): void {
  const workspaceRoot = process.cwd();

  // --list flag: print available timestamps and exit
  if (opts.list) {
    const timestamps = listTimestamps(workspaceRoot);
    if (timestamps.length === 0) {
      logger.info('No backups available.');
      process.exit(0);
    }
    process.stdout.write(`${color.bold('Available backups')}:\n`);
    for (const ts of timestamps) {
      process.stdout.write(`  ${ts}\n`);
    }
    process.exit(0);
  }

  // Check if any backups exist
  const timestamps = listTimestamps(workspaceRoot);
  if (timestamps.length === 0) {
    logger.error('No backups found. Nothing to restore.');
    process.exit(1);
  }

  // Restore from specified timestamp or latest
  const restored = restore(workspaceRoot, opts.timestamp);

  if (restored.length === 0) {
    logger.info('No files to restore from backup.');
    process.exit(0);
  }

  process.stdout.write(`${color.bold('Restored files')}:\n`);
  for (const file of restored) {
    process.stdout.write(`  ${color.green('+')} ${file}\n`);
  }
  logger.success(`Restored ${restored.length} files.`);
}
