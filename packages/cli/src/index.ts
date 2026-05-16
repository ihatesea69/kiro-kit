#!/usr/bin/env node

import { createRequire } from 'node:module';
import process from 'node:process';
import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerAddCommand } from './commands/add.js';
import { registerListCommand } from './commands/list.js';
import { registerInfoCommand } from './commands/info.js';
import { registerUpdateCommand } from './commands/update.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerTelemetryCommand } from './commands/telemetry.js';
import { setVerbose, setQuiet } from './utils/logger.js';

// Node version check
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 18) {
  process.stderr.write(
    '[KK001] kiro-kit requires Node.js >= 18. ' +
      `Current version: ${process.version}. ` +
      'Please upgrade Node.js.\n',
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('kiro-kit')
  .description('CLI tool for bootstrapping engineer-grade Kiro IDE workspaces.')
  .version(pkg.version, '-v, --version');

// Global flags
program.option('--verbose', 'Enable verbose output');
program.option('--quiet', 'Suppress non-essential output');
program.option('--no-color', 'Disable colored output');

// Wire all commands
registerInitCommand(program);
registerAddCommand(program);
registerListCommand(program);
registerInfoCommand(program);
registerUpdateCommand(program);
registerRestoreCommand(program);
registerDoctorCommand(program);
registerTelemetryCommand(program);

// Apply global flags before command execution
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts['verbose']) setVerbose(true);
  if (opts['quiet']) setQuiet(true);
});

program.parse(process.argv);
