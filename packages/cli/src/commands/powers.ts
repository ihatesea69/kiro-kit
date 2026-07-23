import { Command } from 'commander';
import process from 'node:process';

import {
  POWER_CATALOG,
  installPowers,
  powersForPresets,
  kiroPowersAvailable,
  isKiroRunning,
} from '../core/PowerInstaller.js';
import { listAvailable } from '../core/PresetLoader.js';
import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';

interface InstallOptions {
  all?: boolean;
  preset?: string[];
  force?: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Resolve which power names to install from flags/args. */
function resolveNames(names: string[], opts: InstallOptions): string[] {
  if (names.length > 0) return names;
  if (opts.all) return Object.keys(POWER_CATALOG);
  if (opts.preset && opts.preset.length > 0) return powersForPresets(opts.preset);
  return [];
}

function runInstall(names: string[], opts: InstallOptions): void {
  if (!kiroPowersAvailable()) {
    logger.error(
      'Kiro powers directory (~/.kiro/powers) not found. Is Kiro installed for this user?',
    );
    process.exit(1);
  }

  const toInstall = resolveNames(names, opts);
  if (toInstall.length === 0) {
    logger.info('Nothing to install. Pass power names, --all, or --preset <name>.');
    process.stdout.write(`Available powers: ${Object.keys(POWER_CATALOG).join(', ')}\n`);
    process.exit(0);
  }

  // Kiro overwrites installed.json on exit, so it must be closed first.
  if (isKiroRunning() && !opts.force) {
    logger.error(
      'Kiro appears to be running. Close it first (it overwrites installed.json on exit), ' +
        'then re-run. Use --force to override.',
    );
    process.exit(1);
  }

  process.stdout.write(`Installing ${toInstall.length} power(s): ${toInstall.join(', ')}\n`);
  const results = installPowers(toInstall);

  let installed = 0;
  for (const r of results) {
    switch (r.status) {
      case 'installed':
        process.stdout.write(`  ${color.green('✔')} ${r.name}\n`);
        installed++;
        break;
      case 'already':
        process.stdout.write(`  ${color.dim('=')} ${r.name} (already installed)\n`);
        break;
      case 'skipped':
        process.stdout.write(`  ${color.yellow('•')} ${r.name} (${r.message})\n`);
        break;
      case 'error':
        process.stdout.write(`  ${color.red('✖')} ${r.name} (${r.message})\n`);
        break;
    }
  }

  if (installed > 0) {
    logger.success(`Installed ${installed} power(s). Restart Kiro to see them.`);
    process.stdout.write(
      color.dim('Backup saved at ~/.kiro/powers/installed.json.bak (reversible).\n'),
    );
  } else {
    logger.info('No new powers installed.');
  }
}

function runList(): void {
  process.stdout.write(`${color.bold('Installable Kiro Powers')} (real marketplace powers):\n\n`);
  const presets = listAvailable();
  for (const [name, spec] of Object.entries(POWER_CATALOG)) {
    const relevant = spec.presets.filter((p) => presets.includes(p)).join(', ');
    process.stdout.write(`  ${color.cyan(name.padEnd(28))} ${spec.displayName}\n`);
    process.stdout.write(`  ${' '.repeat(28)} ${color.dim(`presets: ${relevant}`)}\n`);
  }
  process.stdout.write(
    `\nInstall with: ${color.bold('kiro-kit powers install --preset <name>')} ` +
      `(close Kiro first).\n`,
  );
  process.stdout.write(
    color.dim(
      'Note: Context7, Upstash, Snyk, Sentry are MCP servers (in .kiro/settings/mcp.json), not marketplace Powers.\n',
    ),
  );
}

export function registerPowersCommand(program: Command): void {
  const powers = program.command('powers').description('Manage Kiro Powers');

  powers
    .command('list')
    .description('List installable Kiro Powers')
    .action(() => {
      try {
        runList();
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  powers
    .command('install [names...]')
    .description('Install real Kiro Powers (close Kiro first)')
    .option('--all', 'Install every power in the catalog')
    .option('--preset <name>', 'Install powers relevant to a preset (repeatable)', collect, [])
    .option('--force', 'Install even if Kiro appears to be running')
    .action((names: string[], opts: InstallOptions) => {
      try {
        runInstall(names, opts);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
