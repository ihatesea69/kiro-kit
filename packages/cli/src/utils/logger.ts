import process from 'node:process';
import { color } from './color.js';

let verboseEnabled = false;
let quietEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

export function setQuiet(enabled: boolean): void {
  quietEnabled = enabled;
}

export const logger = {
  info(msg: string): void {
    if (!quietEnabled) {
      process.stdout.write(`${msg}\n`);
    }
  },

  success(msg: string): void {
    if (!quietEnabled) {
      process.stdout.write(`${color.green(msg)}\n`);
    }
  },

  warn(msg: string): void {
    process.stderr.write(`${color.yellow('WARN')} ${msg}\n`);
  },

  error(msg: string): void {
    process.stderr.write(`${color.red('ERROR')} ${msg}\n`);
  },

  debug(msg: string): void {
    if (verboseEnabled) {
      process.stderr.write(`${color.dim('[debug]')} ${msg}\n`);
    }
  },
};
