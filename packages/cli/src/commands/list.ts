import { Command } from 'commander';
import process from 'node:process';

import { load, listAvailable } from '../core/PresetLoader.js';
import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';

interface ListOptions {
  json?: boolean;
}

interface PresetSummary {
  name: string;
  description: string;
  agents: number;
  skills: number;
  commands: number;
  hooks: number;
  workflows: number;
  mcp: number;
}

function countArtifacts(files: Array<{ type: string }>): Record<string, number> {
  const counts: Record<string, number> = {
    agent: 0,
    skill: 0,
    command: 0,
    hook: 0,
    workflow: 0,
    mcp: 0,
  };
  for (const f of files) {
    if (f.type in counts) {
      counts[f.type]++;
    }
  }
  return counts;
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List available presets')
    .option('--json', 'Output as JSON')
    .action((opts: ListOptions) => {
      try {
        runList(opts);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function runList(opts: ListOptions): void {
  const available = listAvailable();
  const summaries: PresetSummary[] = [];

  for (const name of available) {
    try {
      const preset = load(name);
      const counts = countArtifacts(preset.manifest.files);
      summaries.push({
        name,
        description: preset.manifest.description,
        agents: counts['agent'],
        skills: counts['skill'],
        commands: counts['command'],
        hooks: counts['hook'],
        workflows: counts['workflow'],
        mcp: Object.keys(preset.manifest.mcpServers ?? {}).length,
      });
    } catch {
      summaries.push({
        name,
        description: '(failed to load)',
        agents: 0,
        skills: 0,
        commands: 0,
        hooks: 0,
        workflows: 0,
        mcp: 0,
      });
    }
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(summaries, null, 2) + '\n');
    return;
  }

  // Text output
  for (const s of summaries) {
    const nameStr = color.bold(s.name.padEnd(12));
    const descStr = color.dim(`- ${s.description}`);
    process.stdout.write(`  ${nameStr} ${descStr}\n`);
    const counts = `${s.agents} agents, ${s.skills} skills, ${s.commands} commands, ${s.hooks} hooks, ${s.workflows} workflows, ${s.mcp} MCP servers`;
    process.stdout.write(`${''.padEnd(14)} ${color.gray(counts)}\n`);
  }
}
