import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import crypto from 'node:crypto';

import { load, loadAll, listAvailable } from '../core/PresetLoader.js';
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

interface InitOptions {
  yes?: boolean;
  preset?: string[];
  force?: boolean;
  skipExisting?: boolean;
  color?: boolean;
}

// Handle SIGINT at process level for exit 130
function setupSigintHandler(): void {
  process.on('SIGINT', () => {
    process.exit(130);
  });
}

/**
 * Interactive multi-pick prompt using readline.
 * Space to toggle, 'a' to toggle all, Enter to confirm.
 */
async function multiPickPrompt(
  items: Array<{ name: string; description: string }>,
): Promise<string[]> {
  const selected = new Set<number>();
  let cursor = 0;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // Enable raw mode for keypress detection
  if (!process.stdin.isTTY) {
    // Non-interactive: return empty
    rl.close();
    return [];
  }

  return new Promise<string[]>((resolve, reject) => {
    let rendered = false;

    const render = (): void => {
      // Move cursor up to overwrite previous render
      if (rendered) {
        process.stdout.write(`\x1B[${items.length + 1}A`);
      }
      rendered = true;
      // Clear line + write header
      process.stdout.write(
        '\x1B[2K' +
          color.bold('? Select presets to install:') +
          color.dim(' (Space to select, <a> toggle all, Enter to confirm)') +
          '\n',
      );
      for (let i = 0; i < items.length; i++) {
        const marker = cursor === i ? color.cyan('>') : ' ';
        const check = selected.has(i)
          ? color.green('[x]')
          : '[ ]';
        const name = color.bold(items[i].name.padEnd(12));
        const desc = color.dim(`- ${items[i].description}`);
        // Clear line before writing to prevent ghost text
        process.stdout.write(`\x1B[2K  ${marker} ${check} ${name} ${desc}\n`);
      }
    };

    // Initial render (no need for blank lines — first render writes directly)
    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    let escBuffer = '';

    const onData = (key: string): void => {
      // Handle multi-byte escape sequences (arrow keys on Windows)
      if (escBuffer.length > 0) {
        escBuffer += key;
        if (escBuffer.length >= 3) {
          const seq = escBuffer;
          escBuffer = '';
          if (seq === '\x1B[A' || seq === '\x1BOA') {
            cursor = (cursor - 1 + items.length) % items.length;
            render();
          } else if (seq === '\x1B[B' || seq === '\x1BOB') {
            cursor = (cursor + 1) % items.length;
            render();
          }
          return;
        }
        return;
      }

      // Start of escape sequence
      if (key === '\x1B') {
        escBuffer = key;
        return;
      }

      // Ctrl+C / SIGINT
      if (key === '\x03') {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        rl.close();
        reject(new Error('SIGINT'));
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        rl.close();
        const result = [...selected].map((i) => items[i].name);
        resolve(result);
        return;
      }

      // Space - toggle current
      if (key === ' ') {
        if (selected.has(cursor)) {
          selected.delete(cursor);
        } else {
          selected.add(cursor);
        }
        render();
        return;
      }

      // 'a' - toggle all
      if (key === 'a' || key === 'A') {
        if (selected.size === items.length) {
          selected.clear();
        } else {
          for (let i = 0; i < items.length; i++) selected.add(i);
        }
        render();
        return;
      }

      // Arrow up / k
      if (key === 'k') {
        cursor = (cursor - 1 + items.length) % items.length;
        render();
        return;
      }

      // Arrow down / j
      if (key === 'j') {
        cursor = (cursor + 1) % items.length;
        render();
        return;
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * Confirmation prompt: "About to write X files. Continue? (Y/n)"
 */
async function confirmPrompt(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${color.bold('?')} ${message} `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('SIGINT'));
    });
  });
}

/**
 * Interactive 4-option conflict prompt.
 */
async function conflictPrompt(
  target: string,
): Promise<'overwrite' | 'skip' | 'view-diff' | 'overwrite-all'> {
  if (!process.stdin.isTTY) return 'skip';

  const relTarget = path.relative(process.cwd(), target);
  process.stdout.write(
    `\n${color.yellow('?')} File ${color.bold(relTarget)} already exists with different content.\n` +
      `  ${color.cyan('>')} overwrite       - Replace existing file (backup will be saved)\n` +
      `    skip            - Keep existing file\n` +
      `    view diff       - Show unified diff and ask again\n` +
      `    overwrite all   - Replace this and all remaining conflicting files\n`,
  );

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`  Choice (overwrite/skip/diff/all): `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'o' || a === 'overwrite') resolve('overwrite');
      else if (a === 's' || a === 'skip') resolve('skip');
      else if (a === 'd' || a === 'diff' || a === 'view diff') resolve('view-diff');
      else if (a === 'a' || a === 'all' || a === 'overwrite all') resolve('overwrite-all');
      else resolve('skip'); // default to skip on unrecognized input
    });

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('SIGINT'));
    });
  });
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Register the init command on the given program.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize workspace with selected presets')
    .option('-y, --yes', 'Skip confirmation, accept defaults')
    .option('--preset <name>', 'Specify preset (repeatable)', collectPreset, [])
    .option('--force', 'Overwrite all files (with backup)')
    .option('--skip-existing', 'Skip all existing files')
    .option('--no-color', 'Disable ANSI colors')
    .action(async (opts: InitOptions) => {
      setupSigintHandler();
      try {
        await runInit(opts);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'SIGINT') {
          process.exit(130);
        }
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function collectPreset(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function runInit(opts: InitOptions): Promise<void> {
  const workspaceRoot = process.cwd();
  const available = listAvailable();

  // 1. Determine selected presets
  let selectedNames: string[];

  if (opts.preset && opts.preset.length > 0) {
    // Validate preset names
    for (const name of opts.preset) {
      if (!available.includes(name)) {
        logger.error(
          `Preset "${name}" not found. Available: ${available.join(', ')}`,
        );
        process.exit(1);
      }
    }
    selectedNames = opts.preset;
  } else {
    // Interactive multi-pick
    const items = available.map((name) => {
      try {
        const preset = load(name);
        return { name, description: preset.manifest.description };
      } catch {
        return { name, description: '' };
      }
    });

    selectedNames = await multiPickPrompt(items);
  }

  // Empty selection -> exit 0
  if (selectedNames.length === 0) {
    logger.info('No presets selected. Exiting.');
    process.exit(0);
  }

  // 2. Load selected presets
  const presets = loadAll(selectedNames);

  // 3. Plan operations - count total files
  let totalFiles = 0;
  for (const preset of presets) {
    totalFiles += preset.manifest.files.length;
  }

  // 4. Show summary and ask for confirmation
  if (!opts.yes) {
    const confirmed = await confirmPrompt(
      `About to write ${totalFiles} files into .kiro/ and workspace. Continue? (Y/n)`,
    );
    if (!confirmed) {
      logger.info('Cancelled.');
      process.exit(0);
    }
  }

  // 5. Determine conflict mode
  let mode: ConflictMode = 'interactive';
  if (opts.force) mode = 'force';
  else if (opts.skipExisting) mode = 'skip-existing';
  else if (opts.yes) mode = 'skip-existing';

  const sessionState: SessionState = { overwriteAll: false };
  const timestamp = generateTimestamp();

  // Track written files for tracking store
  const allTrackedFiles: TrackingStore.TrackedFile[] = [];
  let filesWritten = 0;
  let filesSkipped = 0;

  // 6. Process each preset
  for (const preset of presets) {
    const { manifest, dir: presetDir } = preset;

    // Separate files by type for special handling
    const regularFiles = manifest.files.filter(
      (f) => !['mcp', 'settings', 'statusline'].includes(f.type),
    );
    const mcpFiles = manifest.files.filter((f) => f.type === 'mcp');
    const settingsFiles = manifest.files.filter((f) => f.type === 'settings');
    const statuslineFiles = manifest.files.filter((f) => f.type === 'statusline');

    // Process regular files
    for (const fileEntry of regularFiles) {
      const sourcePath = path.join(presetDir, fileEntry.source);
      const targetPath = path.resolve(workspaceRoot, fileEntry.target);

      // Safety check
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
          // Set executable bit if needed
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
          // File already identical
          break;
      }

      // Track the file regardless of action (for tracking store)
      if (action !== 'SKIP') {
        allTrackedFiles.push({
          target: fileEntry.target,
          sourcePreset: manifest.name,
          contentHash: sha256(sourceContent),
          installedAt: new Date().toISOString(),
        });
      }
    }

    // Process statusline files via StatuslineSelector
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
    if (mcpFiles.length > 0 && manifest.mcpServers) {
      const mcpPath = path.join(workspaceRoot, '.kiro/settings/mcp.json');
      let existingMcp: MCPConfig | null = null;
      if (fs.existsSync(mcpPath)) {
        try {
          existingMcp = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')) as MCPConfig;
        } catch {
          existingMcp = null;
        }
      }
      const merged = mergeMCP(existingMcp, manifest.mcpServers, manifest.name);
      fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
      atomicWrite(mcpPath, JSON.stringify(merged, null, 2) + '\n');
      filesWritten++;
    }

    // Process settings merge
    if (settingsFiles.length > 0) {
      const settingsPath = path.join(workspaceRoot, '.kiro/settings.json');
      let existingSettings: SettingsConfig | null = null;
      if (fs.existsSync(settingsPath)) {
        try {
          existingSettings = JSON.parse(
            fs.readFileSync(settingsPath, 'utf-8'),
          ) as SettingsConfig;
        } catch {
          existingSettings = null;
        }
      }

      // Read preset settings
      const presetSettingsPath = path.join(presetDir, 'settings.json');
      if (fs.existsSync(presetSettingsPath)) {
        const presetSettings = JSON.parse(
          fs.readFileSync(presetSettingsPath, 'utf-8'),
        ) as SettingsConfig;

        // Resolve statusline command per platform
        const resolvedSettings = StatuslineSelector.resolveSettingsCommand(
          presetSettings as Record<string, unknown>,
        ) as SettingsConfig;

        const merged = mergeSettings(existingSettings, resolvedSettings);
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        atomicWrite(settingsPath, JSON.stringify(merged, null, 2) + '\n');
        filesWritten++;
      }
    }

    // Also write .mcp.json.example if present in preset (as regular file)
    const mcpExampleSource = path.join(presetDir, '.mcp.json.example');
    if (fs.existsSync(mcpExampleSource)) {
      const mcpExampleTarget = path.join(workspaceRoot, '.kiro/.mcp.json.example');
      if (!fs.existsSync(mcpExampleTarget)) {
        fs.mkdirSync(path.dirname(mcpExampleTarget), { recursive: true });
        fs.copyFileSync(mcpExampleSource, mcpExampleTarget);
      }
    }
  }

  // 7. Write metadata.json
  const kitVersion = getKitVersion();
  const presetMetas = presets.map((p) => ({
    name: p.manifest.name,
    version: p.manifest.version,
  }));

  const existingMeta = MetadataWriter.read(workspaceRoot);
  const metadata = existingMeta
    ? MetadataWriter.mergePresets(existingMeta, presetMetas)
    : MetadataWriter.compose({
        kitVersion,
        repository: 'https://github.com/ihatesea69/kiro-kit.git',
        presets: presetMetas,
      });

  MetadataWriter.write(workspaceRoot, metadata);

  // 8. Write tracking file LAST
  let trackingData = TrackingStore.read(workspaceRoot) ?? TrackingStore.createInitial(kitVersion);

  for (const preset of presets) {
    const presetFiles = allTrackedFiles.filter(
      (f) => f.sourcePreset === preset.manifest.name,
    );
    const trackedPreset: TrackingStore.TrackedPreset = {
      name: preset.manifest.name,
      version: preset.manifest.version,
      installedAt: new Date().toISOString(),
      files: presetFiles,
    };
    trackingData = TrackingStore.upsertPreset(trackingData, trackedPreset);
  }

  trackingData.kitVersion = kitVersion;
  TrackingStore.write(workspaceRoot, trackingData);

  // 9. Print summary
  logger.success(
    `Done! ${filesWritten} files written, ${filesSkipped} skipped.`,
  );
  logger.info(
    `Presets installed: ${selectedNames.join(', ')}`,
  );
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
    const pkgPath = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}
