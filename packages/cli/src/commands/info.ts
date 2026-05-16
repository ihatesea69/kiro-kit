import { Command } from 'commander';
import process from 'node:process';

import { load, listAvailable } from '../core/PresetLoader.js';
import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';

interface InfoOptions {
  json?: boolean;
}

interface PresetInfo {
  name: string;
  version: string;
  description: string;
  category: string;
  files: Array<{ source: string; target: string; type: string }>;
  mcpServers: string[];
  hooks: string[];
  agents: string[];
  skills: string[];
  commands: string[];
  workflows: string[];
}

export function registerInfoCommand(program: Command): void {
  program
    .command('info <preset>')
    .description('Show detailed preset information')
    .option('--json', 'Output as JSON')
    .action((presetName: string, opts: InfoOptions) => {
      try {
        runInfo(presetName, opts);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function runInfo(presetName: string, opts: InfoOptions): void {
  const available = listAvailable();

  if (!available.includes(presetName)) {
    logger.error(
      `Preset "${presetName}" not found. Available: ${available.join(', ')}`,
    );
    process.exit(1);
  }

  const preset = load(presetName);
  const { manifest } = preset;

  const agents = manifest.files.filter((f) => f.type === 'agent').map((f) => f.source);
  const skills = manifest.files.filter((f) => f.type === 'skill').map((f) => f.source);
  const commands = manifest.files.filter((f) => f.type === 'command').map((f) => f.source);
  const workflows = manifest.files.filter((f) => f.type === 'workflow').map((f) => f.source);
  const hooks = manifest.files.filter((f) => f.type === 'hook').map((f) => f.source);
  const mcpServers = Object.keys(manifest.mcpServers ?? {});

  const info: PresetInfo = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    category: manifest.category,
    files: manifest.files.map((f) => ({ source: f.source, target: f.target, type: f.type })),
    mcpServers,
    hooks,
    agents,
    skills,
    commands,
    workflows,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(info, null, 2) + '\n');
    return;
  }

  // Text output
  process.stdout.write(`\n${color.bold(manifest.name)} v${manifest.version}\n`);
  process.stdout.write(`${manifest.description}\n\n`);
  process.stdout.write(`${color.dim('Category:')} ${manifest.category}\n`);
  process.stdout.write(`${color.dim('Total files:')} ${manifest.files.length}\n\n`);

  if (mcpServers.length > 0) {
    process.stdout.write(`${color.bold('MCP Servers')} (${mcpServers.length}):\n`);
    for (const s of mcpServers) {
      process.stdout.write(`  - ${s}\n`);
    }
    process.stdout.write('\n');
  }

  if (agents.length > 0) {
    process.stdout.write(`${color.bold('Agents')} (${agents.length}):\n`);
    for (const a of agents) {
      process.stdout.write(`  - ${a}\n`);
    }
    process.stdout.write('\n');
  }

  if (skills.length > 0) {
    process.stdout.write(`${color.bold('Skills')} (${skills.length}):\n`);
    for (const s of skills) {
      process.stdout.write(`  - ${s}\n`);
    }
    process.stdout.write('\n');
  }

  if (commands.length > 0) {
    process.stdout.write(`${color.bold('Commands')} (${commands.length}):\n`);
    for (const c of commands) {
      process.stdout.write(`  - ${c}\n`);
    }
    process.stdout.write('\n');
  }

  if (workflows.length > 0) {
    process.stdout.write(`${color.bold('Workflows')} (${workflows.length}):\n`);
    for (const w of workflows) {
      process.stdout.write(`  - ${w}\n`);
    }
    process.stdout.write('\n');
  }

  if (hooks.length > 0) {
    process.stdout.write(`${color.bold('Hooks')} (${hooks.length}):\n`);
    for (const h of hooks) {
      process.stdout.write(`  - ${h}\n`);
    }
    process.stdout.write('\n');
  }

  // File list with targets
  process.stdout.write(`${color.bold('File Targets')}:\n`);
  for (const f of manifest.files) {
    process.stdout.write(`  ${color.dim(f.type.padEnd(12))} ${f.target}\n`);
  }
}
