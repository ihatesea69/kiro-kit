import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';

const CONFIG_DIR = path.join(os.homedir(), '.kiro-kit');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface TelemetryConfig {
  telemetry: boolean;
  [key: string]: unknown;
}

function readConfig(): TelemetryConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as TelemetryConfig;
    }
  } catch { /* ignore corrupt config */ }
  return { telemetry: false };
}

function writeConfig(config: TelemetryConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function registerTelemetryCommand(program: Command): void {
  const telemetry = program
    .command('telemetry')
    .description('Manage anonymous usage telemetry');

  telemetry
    .command('enable')
    .description('Opt in to anonymous telemetry')
    .action(() => {
      try {
        const config = readConfig();
        config.telemetry = true;
        writeConfig(config);
        logger.success(
          'Telemetry preference set to enabled (stored locally). ' +
            'No usage data is transmitted in this version.',
        );
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  telemetry
    .command('disable')
    .description('Opt out of telemetry')
    .action(() => {
      try {
        const config = readConfig();
        config.telemetry = false;
        writeConfig(config);
        logger.success('Telemetry disabled. No data will be collected.');
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  telemetry
    .command('status')
    .description('Show current telemetry status')
    .action(() => {
      try {
        const config = readConfig();
        const status = config.telemetry ? color.green('enabled') : color.yellow('disabled');
        process.stdout.write(`Telemetry: ${status}\n`);
        process.stdout.write(`Config: ${CONFIG_FILE}\n`);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
