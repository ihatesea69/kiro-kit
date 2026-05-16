import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

import { load, listAvailable } from '../core/PresetLoader.js';
import { resolve as resolveConflict, type ConflictMode, type SessionState } from '../core/ConflictResolver.js';
import { backup } from '../core/BackupManager.js';
import * as TrackingStore from '../core/TrackingStore.js';
import * as MetadataWriter from '../core/MetadataWriter.js';
import * as StatuslineSelector from '../core/StatuslineSelector.js';
import { mergeMCP, type MCPConfig } from '../core/merge/mergeMCP.js';
import { mergeSettings, type SettingsConfig } from '../core/merge/mergeSettings.js';
import { showDiff } from '../prompts/DiffViewer.js';
import { atomicWrite } from '../utils/fs-safe.js';
import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';
import { safePathInside } from '../utils/paths.js';

interface AddOptions {
  yes?: boolean;
  force?: boolean;
  skipExisting?: boolean;
  color?: boolean;
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
    `\n${color.yellow('?')} File ${color.bold(relTarget)} already exists with different content.\n` +
      `  ${color.cyan('>')} overwrite       - Replace existing file (backup will be saved)\n` +
      `    skip            - Keep existing file\n` +
      `    view diff       - Show unified diff and ask again\n` +
      `    overwrite all   - Replace this and all remaining conflicting files\n`,
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

export function registerAddCommand(program: Command): void {
  program
    .command('add <preset>')
    .description('Add a preset to existing workspace')
    .option('-y, --yes', 'Skip confirmation')
    .option('--force', 'Overwrite all files (with backup)')
    .option('--skip-existing', 'Skip all existing files')
    .option('--no-color', 'Disable ANSI colors')
    .action(async (presetName: string, opts: AddOptions) => {
      try {
        await runAdd(presetName, opts);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

async function runAdd(presetName: string, opts: AddOptions): Promise<void> {
  const workspaceRoot = process.cwd();
  const available = listAvailable();

  // Validate preset name
  if (!available.includes(presetName)) {
    logger.error(
      `Preset "${presetName}" not found. Available: ${available.join(', ')}`,
    );
    process.exit(1);
  }

  // Auto-init: create .kiro/ if it doesn't exist
  const kiroDir = path.join(workspaceRoot, '.kiro');
  if (!fs.existsSync(kiroDir)) {
    fs.mkdirSync(kiroDir, { recursive: true });
    logger.info('Created .kiro/ directory.');
  }

  // Load preset
  const preset = load(presetName);

  // Determine conflict mode
  let mode: ConflictMode = 'interactive';
  if (opts.force) mode = 'force';
  else if (opts.skipExisting) mode = 'skip-existing';
  else if (opts.yes) mode = 'skip-existing';

  const sessionState: SessionState = { overwriteAll: false };
  const timestamp = generateTimestamp();
  const allTrackedFiles: TrackingStore.TrackedFile[] = [];
  let filesWritten = 0;
  let filesSkipped = 0;

  const { manifest, dir: presetDir } = preset;

  // Separate files by type
  const regularFiles = manifest.files.filter(
    (f) => !['mcp', 'settings', 'statusline'].includes(f.type),
  );
  const statuslineFiles = manifest.files.filter((f) => f.type === 'statusline');

  // Process regular files
  for (const fileEntry of regularFiles) {
    const sourcePath = path.join(presetDir, fileEntry.source);
    const targetPath = path.resolve(workspaceRoot, fileEntry.target);

    if (!safePathInside(workspaceRoot, fileEntry.target)) {
      logger.warn(`Skipping unsafe path: ${fileEntry.target}`);
      filesSkipped++;
      continue;
    }

    if (!fs.existsSync(sourcePath)) {
      logger.debug(`Source file missing: ${sourcePath}`);
      continue;
    }

    const sourceContent = fs.readFileSync(sourcePath);

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
          try { fs.chmodSync(targetPath, 0o755); } catch { /* non-critical */ }
        }
        filesWritten++;
        break;
      case 'OVERWRITE_WITH_BACKUP':
        backup(workspaceRoot, targetPath, timestamp);
        atomicWrite(targetPath, sourceContent.toString('utf-8'));
        if (fileEntry.executable && process.platform !== 'win32') {
          try { fs.chmodSync(targetPath, 0o755); } catch { /* non-critical */ }
        }
        filesWritten++;
        break;
      case 'SKIP':
        filesSkipped++;
        break;
      case 'NO_OP':
        break;
    }

    if (action !== 'SKIP') {
      allTrackedFiles.push({
        target: fileEntry.target,
        sourcePreset: manifest.name,
        contentHash: sha256(sourceContent),
        installedAt: new Date().toISOString(),
      });
    }
  }

  // Process statusline files
  if (statuslineFiles.length > 0) {
    const installed = StatuslineSelector.install(presetDir, workspaceRoot);
    filesWritten += installed.length;
    for (const f of installed) {
      allTrackedFiles.push({
        target: f,
        sourcePreset: manifest.name,
        contentHash: '',
        installedAt: new Date().toISOString(),
      });
    }
  }

  // Process MCP merge
  if (manifest.mcpServers) {
    const mcpPath = path.join(workspaceRoot, '.kiro/settings/mcp.json');
    let existingMcp: MCPConfig | null = null;
    if (fs.existsSync(mcpPath)) {
      try {
        existingMcp = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')) as MCPConfig;
      } catch { existingMcp = null; }
    }
    const merged = mergeMCP(existingMcp, manifest.mcpServers, manifest.name);
    fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
    atomicWrite(mcpPath, JSON.stringify(merged, null, 2) + '\n');
    filesWritten++;
  }

  // Process settings merge
  const presetSettingsPath = path.join(presetDir, 'settings.json');
  if (fs.existsSync(presetSettingsPath)) {
    const settingsPath = path.join(workspaceRoot, '.kiro/settings.json');
    let existingSettings: SettingsConfig | null = null;
    if (fs.existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as SettingsConfig;
      } catch { existingSettings = null; }
    }
    const presetSettings = JSON.parse(fs.readFileSync(presetSettingsPath, 'utf-8')) as SettingsConfig;
    const resolvedSettings = StatuslineSelector.resolveSettingsCommand(
      presetSettings as Record<string, unknown>,
    ) as SettingsConfig;
    const merged = mergeSettings(existingSettings, resolvedSettings);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    atomicWrite(settingsPath, JSON.stringify(merged, null, 2) + '\n');
    filesWritten++;
  }

  // Write metadata
  const kitVersion = getKitVersion();
  const presetMeta = { name: manifest.name, version: manifest.version };
  const existingMeta = MetadataWriter.read(workspaceRoot);
  const metadata = existingMeta
    ? MetadataWriter.mergePresets(existingMeta, [presetMeta])
    : MetadataWriter.compose({ kitVersion, repository: 'https://github.com/ihatesea69/kiro-kit.git', presets: [presetMeta] });
  MetadataWriter.write(workspaceRoot, metadata);

  // Write tracking file LAST
  let trackingData = TrackingStore.read(workspaceRoot) ?? TrackingStore.createInitial(kitVersion);
  const trackedPreset: TrackingStore.TrackedPreset = {
    name: manifest.name,
    version: manifest.version,
    installedAt: new Date().toISOString(),
    files: allTrackedFiles,
  };
  trackingData = TrackingStore.upsertPreset(trackingData, trackedPreset);
  trackingData.kitVersion = kitVersion;
  TrackingStore.write(workspaceRoot, trackingData);

  // Summary
  logger.success(`Done! ${filesWritten} files written, ${filesSkipped} skipped.`);
  logger.info(`Preset added: ${presetName}`);
}
