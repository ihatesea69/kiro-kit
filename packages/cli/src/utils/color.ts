import pc from 'picocolors';
import process from 'node:process';

const isColorDisabled =
  !!process.env['NO_COLOR'] ||
  process.argv.includes('--no-color') ||
  !process.stdout.isTTY;

function wrap(fn: (s: string) => string): (s: string) => string {
  return (s: string) => (isColorDisabled ? s : fn(s));
}

export const color = {
  green: wrap(pc.green),
  red: wrap(pc.red),
  yellow: wrap(pc.yellow),
  blue: wrap(pc.blue),
  cyan: wrap(pc.cyan),
  gray: wrap(pc.gray),
  bold: wrap(pc.bold),
  dim: wrap(pc.dim),
};
