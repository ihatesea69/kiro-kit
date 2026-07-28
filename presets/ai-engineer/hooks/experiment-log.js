#!/usr/bin/env node
/**
 * Checks that experiment configs have corresponding log entries
 * in the experiments/ directory.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIRS = ['configs', 'config', 'experiments/configs', 'src/configs'];
const LOG_DIRS = ['experiments', 'experiments/logs', 'logs/experiments', 'mlruns'];
const CONFIG_EXTENSIONS = ['.yaml', '.yml', '.toml', '.json'];

const cwd = process.cwd();

function findConfigs(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findConfigs(full));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CONFIG_EXTENSIONS.includes(ext) && /experiment|exp|run/i.test(entry.name)) {
          results.push(full);
        }
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

let configFiles = [];
for (const dir of CONFIG_DIRS) {
  configFiles.push(...findConfigs(path.resolve(cwd, dir)));
}

if (configFiles.length === 0) {
  process.exit(0);
}

// Find log directories
let logDir = null;
for (const dir of LOG_DIRS) {
  const full = path.resolve(cwd, dir);
  if (fs.existsSync(full)) {
    logDir = full;
    break;
  }
}

if (!logDir) {
  process.stdout.write(
    '[experiment-log] Experiment configs found but no experiments/ log directory.\n' +
    '  Create an experiments/ directory to track experiment results.\n'
  );
  process.exit(1);
}

// Check each config has a corresponding log entry
const logEntries = new Set();
try {
  const entries = fs.readdirSync(logDir, { withFileTypes: true });
  for (const entry of entries) {
    logEntries.add(path.basename(entry.name, path.extname(entry.name)).toLowerCase());
  }
} catch (e) { /* skip */ }

const unlogged = [];
for (const config of configFiles) {
  const baseName = path.basename(config, path.extname(config)).toLowerCase();
  if (!logEntries.has(baseName)) {
    unlogged.push(path.relative(cwd, config));
  }
}

if (unlogged.length > 0) {
  process.stdout.write(`[experiment-log] ${unlogged.length} experiment config(s) without log entries:\n`);
  unlogged.forEach((u) => process.stdout.write(`  - ${u}\n`));
  process.stdout.write('  Run experiments and log results before committing configs.\n');
  process.exit(1);
}

process.exit(0);
