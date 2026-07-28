/**
 * init.ts — The `kiro-kit init` command.
 *
 * Orchestrates the full init flow by bridging Core modules with the UI layer.
 * This file is the ONLY place that imports from both src/core/* and src/ui/*.
 *
 * Flow:
 *   1. Detect capability + build UI objects (theme, screens, prompt, runner)
 *   2. Render welcome screen
 *   3. Resolve preset selection (flag or interactive prompt)
 *   4. Confirm file count (unless --yes)
 *   5. Run TaskRunner with 5 tasks: Load → Plan → Write → Powers → Metadata
 *   6. Render summary screen
 *   7. On error: render error box + exit 1
 *   8. On SIGINT: cleanup + exit 130
 */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

// Core modules (business logic — unchanged)
import { load, loadAll, listAvailable } from '../core/PresetLoader.js';
import {
  resolve as resolveConflict,
  type ConflictAction,
  type ConflictMode,
  type SessionState,
} from '../core/ConflictResolver.js';
import { backup } from '../core/BackupManager.js';
import * as TrackingStore from '../core/TrackingStore.js';
import * as MetadataWriter from '../core/MetadataWriter.js';
import * as StatuslineSelector from '../core/StatuslineSelector.js';
import { mergeMCP, type MCPConfig } from '../core/merge/mergeMCP.js';
import { mergeSettings, type SettingsConfig } from '../core/merge/mergeSettings.js';
import { showDiff } from '../prompts/DiffViewer.js';
import { atomicWrite } from '../utils/fs-safe.js';
import { logger } from '../utils/logger.js';
import { safePathInside } from '../utils/paths.js';

// Powers integration modules
import {
  loadPowers,
  mergePowers,
  filterByTier,
  type PowerEntry,
} from '../core/PowersLoader.js';
import {
  getMCPConfig,
  mergeMCPConfig,
  writeMCPConfig,
  writeKiroSettingsMCP,
  type MCPServerEntry,
  type MCPPresetConfig,
} from '../core/MCPConfigurator.js';
import { generateSetupGuide, writeSetupGuide } from '../core/SetupGuideGenerator.js';
import {
  collectEnvVars,
  generateEnvTemplate,
  readExistingEnv,
  writeEnvTemplate,
} from '../core/EnvTemplateGenerator.js';
import {
  promptPowersTier,
  displayPowersRecommendations,
  type PowersPromptResult,
} from '../prompts/PowersPrompter.js';
import {
  powersForPresets,
  installPowers,
  kiroPowersAvailable,
  isKiroRunning,
} from '../core/PowerInstaller.js';

// UI layer — presentation only, no core imports inside these modules
import { detectCapability } from '../ui/capability.js';
import { createTheme } from '../ui/theme.js';
import { createInitScreens } from '../ui/screens/InitScreens.js';
import { createPrompt } from '../ui/ThemedPrompt.js';
import { createTaskRunner, type TaskDef } from '../ui/TaskRunner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InitOptions {
  yes?: boolean;
  preset?: string[];
  force?: boolean;
  skipExisting?: boolean;
  color?: boolean;
  powers?: string;
  quiet?: boolean;
}

/**
 * Shared mutable context threaded through all TaskRunner tasks.
 * Tasks read from and write to this object to communicate results.
 */
interface InitTaskContext {
  workspaceRoot: string;
  selectedNames: string[];
  opts: InitOptions;
  timestamp: string;
  mode: ConflictMode;
  sessionState: SessionState;
  allTrackedFiles: TrackingStore.TrackedFile[];
  filesWritten: number;
  filesSkipped: number;
  setupGuideWritten: boolean;
  envExampleWritten: boolean;
  /** Deduplicated regular-file writes, planned before the task runner starts. */
  plannedWrites: PlannedWrite[];
  /** Conflict actions resolved interactively BEFORE the spinner starts.
   *  Prompting inside the task runner would be swallowed by the listr2
   *  renderer and look like a hang, so all prompts happen up front. */
  preResolved: Map<string, ConflictAction>;
  /** Powers data + answers gathered before the task runner starts. */
  mergedPowers: PowerEntry[];
  powersPromptResult: PowersPromptResult | null;
  confirmMCPWrite: boolean;
}

/** One deduplicated file write. When several presets target the same path,
 *  the last selected preset wins (matches sequential overwrite semantics). */
interface PlannedWrite {
  presetName: string;
  target: string;
  targetPath: string;
  sourcePath: string;
  executable?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectPreset(value: string, previous: string[]): string[] {
  return [...previous, value];
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

/**
 * Build the deduplicated list of regular-file writes for the selected presets.
 * Presets overlap heavily (shared agents/steering files); writing them
 * sequentially would make later presets conflict with files the run itself
 * just wrote. Deduplicating by target (last preset wins) avoids those
 * self-conflicts entirely.
 */
function planRegularWrites(
  presets: ReturnType<typeof loadAll>,
  workspaceRoot: string,
): PlannedWrite[] {
  const byTarget = new Map<string, PlannedWrite>();
  for (const preset of presets) {
    for (const fileEntry of preset.manifest.files) {
      if (['mcp', 'settings', 'statusline'].includes(fileEntry.type)) continue;
      if (!safePathInside(workspaceRoot, fileEntry.target)) {
        logger.warn(`Skipping unsafe path: ${fileEntry.target}`);
        continue;
      }
      const sourcePath = path.join(preset.dir, fileEntry.source);
      if (!fs.existsSync(sourcePath)) {
        logger.debug(`Source file missing: ${sourcePath}`);
        continue;
      }
      const targetPath = path.resolve(workspaceRoot, fileEntry.target);
      byTarget.set(targetPath, {
        presetName: preset.manifest.name,
        target: fileEntry.target,
        targetPath,
        sourcePath,
        executable: fileEntry.executable,
      });
    }
  }
  return [...byTarget.values()];
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

// ---------------------------------------------------------------------------
// Task definitions
// ---------------------------------------------------------------------------

/**
 * Build the ordered list of TaskDef objects for the init flow.
 * Each task receives the shared InitTaskContext and mutates it.
 *
 * @param presets   - Pre-loaded preset objects (from loadAll)
 * @param _opts     - CLI options (kept for signature stability; unused today)
 */
function buildInitTasks(
  presets: ReturnType<typeof loadAll>,
  _opts: InitOptions,
): TaskDef<InitTaskContext>[] {
  return [
    // ------------------------------------------------------------------
    // Task 1: Loading presets
    // ------------------------------------------------------------------
    {
      title: 'Loading presets',
      run: async (ctx, helpers) => {
        helpers.setOutput(`${presets.length} preset(s) selected`);
        // Presets are already loaded — this task just confirms them in context
        helpers.setTitle(`Loading presets (${presets.length} selected)`);
      },
    },

    // ------------------------------------------------------------------
    // Task 2: Planning operations
    // ------------------------------------------------------------------
    {
      title: 'Planning operations',
      run: async (ctx, helpers) => {
        let totalFiles = 0;
        for (const preset of presets) {
          totalFiles += preset.manifest.files.length;
        }
        helpers.setTitle(`Planning operations (${totalFiles} files)`);
        helpers.setOutput(`${totalFiles} files to process across ${presets.length} preset(s)`);
      },
    },

    // ------------------------------------------------------------------
    // Task 3: Writing workspace files
    // ------------------------------------------------------------------
    {
      title: 'Writing workspace files',
      run: async (ctx, helpers) => {
        // Process the deduplicated regular files. All interactive conflict
        // decisions were made BEFORE the runner started (ctx.preResolved) —
        // never prompt in here, the spinner renderer would swallow it and
        // the CLI would appear to hang forever.
        let processed = 0;
        for (const w of ctx.plannedWrites) {
          const sourceContent = fs.readFileSync(w.sourcePath);

          const action =
            ctx.preResolved.get(w.targetPath) ??
            (await resolveConflict({
              target: w.targetPath,
              sourceContent,
              mode: ctx.mode,
              sessionState: ctx.sessionState,
              // no prompt: unresolved interactive conflicts default to SKIP
            }));

          switch (action) {
            case 'WRITE_NEW':
              fs.mkdirSync(path.dirname(w.targetPath), { recursive: true });
              atomicWrite(w.targetPath, sourceContent.toString('utf-8'));
              if (w.executable && process.platform !== 'win32') {
                try { fs.chmodSync(w.targetPath, 0o755); } catch { /* non-critical */ }
              }
              ctx.filesWritten++;
              break;
            case 'OVERWRITE_WITH_BACKUP':
              backup(ctx.workspaceRoot, w.targetPath, ctx.timestamp);
              atomicWrite(w.targetPath, sourceContent.toString('utf-8'));
              if (w.executable && process.platform !== 'win32') {
                try { fs.chmodSync(w.targetPath, 0o755); } catch { /* non-critical */ }
              }
              ctx.filesWritten++;
              break;
            case 'SKIP':
              ctx.filesSkipped++;
              break;
            case 'NO_OP':
              // File already identical — no action needed
              break;
          }

          if (action !== 'SKIP') {
            ctx.allTrackedFiles.push({
              target: w.target,
              sourcePreset: w.presetName,
              contentHash: sha256(sourceContent),
              installedAt: new Date().toISOString(),
            });
          }

          processed++;
          if (processed % 100 === 0) {
            helpers.setOutput(`${processed}/${ctx.plannedWrites.length} files processed`);
          }
        }

        for (const preset of presets) {
          const { manifest, dir: presetDir } = preset;

          const mcpFiles = manifest.files.filter((f) => f.type === 'mcp');
          const settingsFiles = manifest.files.filter((f) => f.type === 'settings');
          const statuslineFiles = manifest.files.filter((f) => f.type === 'statusline');

          // Process statusline files via StatuslineSelector
          if (statuslineFiles.length > 0) {
            const installed = StatuslineSelector.install(presetDir, ctx.workspaceRoot);
            ctx.filesWritten += installed.length;
            for (const f of installed) {
              ctx.allTrackedFiles.push({
                target: f,
                sourcePreset: manifest.name,
                contentHash: '',
                installedAt: new Date().toISOString(),
              });
            }
          }

          // Process MCP merge
          if (mcpFiles.length > 0 && manifest.mcpServers) {
            const mcpPath = path.join(ctx.workspaceRoot, '.kiro/settings/mcp.json');
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
            ctx.filesWritten++;
          }

          // Process settings merge
          if (settingsFiles.length > 0) {
            const settingsPath = path.join(ctx.workspaceRoot, '.kiro/settings.json');
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

            const presetSettingsPath = path.join(presetDir, 'settings.json');
            if (fs.existsSync(presetSettingsPath)) {
              const presetSettings = JSON.parse(
                fs.readFileSync(presetSettingsPath, 'utf-8'),
              ) as SettingsConfig;

              const resolvedSettings = StatuslineSelector.resolveSettingsCommand(
                presetSettings as Record<string, unknown>,
              ) as SettingsConfig;

              const merged = mergeSettings(existingSettings, resolvedSettings);
              fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
              atomicWrite(settingsPath, JSON.stringify(merged, null, 2) + '\n');
              ctx.filesWritten++;
            }
          }

          // Copy .mcp.json.example if present in preset
          const mcpExampleSource = path.join(presetDir, '.mcp.json.example');
          if (fs.existsSync(mcpExampleSource)) {
            const mcpExampleTarget = path.join(ctx.workspaceRoot, '.kiro/.mcp.json.example');
            if (!fs.existsSync(mcpExampleTarget)) {
              fs.mkdirSync(path.dirname(mcpExampleTarget), { recursive: true });
              fs.copyFileSync(mcpExampleSource, mcpExampleTarget);
            }
          }
        }

        helpers.setTitle(
          `Writing workspace files — ${ctx.filesWritten} written, ${ctx.filesSkipped} skipped`,
        );
      },
    },

    // ------------------------------------------------------------------
    // Task 4: Configuring Powers
    // ------------------------------------------------------------------
    {
      title: 'Configuring Powers',
      skip: (ctx) => {
        if (ctx.opts.powers === 'none') return 'powers disabled';
        return false;
      },
      run: async (ctx, helpers) => {
        try {
          // Powers were loaded and the tier/MCP questions were asked BEFORE
          // the runner started (see runInit) — prompting under the spinner
          // renderer would be invisible and look like a hang.
          const mergedPowers = ctx.mergedPowers;
          const promptResult = ctx.powersPromptResult;

          if (mergedPowers.length === 0 || !promptResult) {
            helpers.setOutput('No powers found in selected presets');
            return;
          }

          helpers.setOutput(`Found ${mergedPowers.length} power(s)`);

          const filteredPowers =
            promptResult.selectedTiers.length > 0
              ? filterByTier(mergedPowers, promptResult.selectedTiers)
              : [];

          // MCP auto-configuration
          if (promptResult.confirmMCP) {
            try {
              const presetMCPConfigs = presets.map((p) => getMCPConfig(p.manifest.name));
              let combinedMCP: Record<string, unknown> | null = null;
              const mcpJsonPath = path.join(ctx.workspaceRoot, '.mcp.json');

              if (fs.existsSync(mcpJsonPath)) {
                try {
                  combinedMCP = JSON.parse(
                    fs.readFileSync(mcpJsonPath, 'utf-8'),
                  ) as Record<string, unknown>;
                } catch {
                  logger.warn('Existing .mcp.json is invalid JSON, will create fresh.');
                  combinedMCP = null;
                }
              }

              for (const mcpConfig of presetMCPConfigs) {
                combinedMCP = mergeMCPConfig(combinedMCP, mcpConfig);
              }

              // MCP write confirmation was collected before the runner started
              if (ctx.confirmMCPWrite && combinedMCP) {
                writeMCPConfig(ctx.workspaceRoot, combinedMCP);
                // Also write to the location Kiro IDE reads.
                writeKiroSettingsMCP(ctx.workspaceRoot, combinedMCP);
                if (!ctx.opts.quiet) {
                  helpers.setOutput('MCP servers configured in .mcp.json and .kiro/settings/mcp.json');
                }
              }
            } catch (err) {
              logger.warn(
                `MCP configuration failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }

          // Display Powers recommendations
          displayPowersRecommendations(filteredPowers, ctx.opts.quiet ?? false);

          // Generate setup guide
          try {
            const mcpServersForGuide = presets.reduce(
              (acc, p) => ({ ...acc, ...getMCPConfig(p.manifest.name).servers }),
              {} as Record<string, MCPServerEntry>,
            );

            const guideContent = generateSetupGuide({
              powers: filteredPowers,
              presetNames: ctx.selectedNames,
              mcpServers: mcpServersForGuide,
            });
            writeSetupGuide(ctx.workspaceRoot, guideContent);
            ctx.setupGuideWritten = true;
            if (!ctx.opts.quiet) {
              helpers.setOutput('Setup guide written to .kiro/POWERS-SETUP.md');
            }
          } catch (err) {
            logger.warn(
              `Setup guide generation failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }

          // Generate/update .env.example
          try {
            const mcpConfigForEnv = presets.reduce(
              (acc, p) => {
                const cfg = getMCPConfig(p.manifest.name);
                return { servers: { ...acc.servers, ...cfg.servers } };
              },
              { servers: {} } as MCPPresetConfig,
            );

            const envVars = collectEnvVars(mcpConfigForEnv, filteredPowers);
            if (envVars.length > 0) {
              const existingEnv = readExistingEnv(ctx.workspaceRoot);
              const envContent = generateEnvTemplate(existingEnv, envVars);
              if (envContent.trim().length > 0) {
                writeEnvTemplate(ctx.workspaceRoot, envContent);
                ctx.envExampleWritten = true;
                if (!ctx.opts.quiet) {
                  helpers.setOutput('Environment template updated in .env.example');
                }
              }
            }
          } catch (err) {
            logger.warn(
              `Env template generation failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        } catch (err) {
          // Powers integration is non-blocking — log warning and continue
          logger.warn(
            `Powers integration failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    },

    // ------------------------------------------------------------------
    // Task 5: Writing tracking metadata
    // ------------------------------------------------------------------
    {
      title: 'Writing tracking metadata',
      run: async (ctx, helpers) => {
        const kitVersion = getKitVersion();
        const presetMetas = presets.map((p) => ({
          name: p.manifest.name,
          version: p.manifest.version,
        }));

        // Write metadata.json
        const existingMeta = MetadataWriter.read(ctx.workspaceRoot);
        const metadata = existingMeta
          ? MetadataWriter.mergePresets(existingMeta, presetMetas)
          : MetadataWriter.compose({
              kitVersion,
              repository: 'https://github.com/ihatesea69/kiro-kit.git',
              presets: presetMetas,
            });
        MetadataWriter.write(ctx.workspaceRoot, metadata);

        // Write tracking store
        let trackingData =
          TrackingStore.read(ctx.workspaceRoot) ??
          TrackingStore.createInitial(kitVersion);

        for (const preset of presets) {
          const presetFiles = ctx.allTrackedFiles.filter(
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
        TrackingStore.write(ctx.workspaceRoot, trackingData);

        helpers.setOutput(`Metadata written (kit v${kitVersion})`);
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Core runInit function
// ---------------------------------------------------------------------------

async function runInit(opts: InitOptions): Promise<void> {
  const workspaceRoot = process.cwd();
  const cliVersion = getKitVersion();

  // -------------------------------------------------------------------------
  // 1. Build UI objects
  // -------------------------------------------------------------------------
  const capability = detectCapability(process.env, process.argv, process.stdout);
  const theme = await createTheme(capability);
  const screens = await createInitScreens({ capability, theme, cliVersion });
  const prompt = await createPrompt(capability, theme);

  // -------------------------------------------------------------------------
  // 2. Render welcome screen
  // -------------------------------------------------------------------------
  screens.welcome({
    cliVersion,
    tipText:
      'You can rerun init anytime — existing files are backed up before overwrite.',
    commands: [
      { name: 'init', description: 'bootstrap a workspace with presets' },
      { name: 'add', description: 'add a preset to an existing workspace' },
      { name: 'list', description: 'list installed presets' },
      { name: 'doctor', description: 'verify workspace integrity' },
    ],
  });

  // -------------------------------------------------------------------------
  // 3. Resolve preset selection
  // -------------------------------------------------------------------------
  const available = listAvailable();
  let selectedNames: string[];

  if (opts.preset && opts.preset.length > 0) {
    // Validate preset names from --preset flag
    for (const name of opts.preset) {
      if (!available.includes(name)) {
        logger.error(`Preset "${name}" not found. Available: ${available.join(', ')}`);
        process.exit(1);
      }
    }
    selectedNames = opts.preset;
  } else {
    // Interactive multi-pick via ThemedPrompt
    const items = available.map((name) => {
      try {
        const preset = load(name);
        return {
          name,
          description: preset.manifest.description ?? '',
        };
      } catch {
        return { name, description: '' };
      }
    });

    selectedNames = await prompt.multiPickPresets(items);
  }

  // Empty selection → exit cleanly
  if (selectedNames.length === 0) {
    if (!capability.isTTY) {
      logger.info('No presets selected. Use --preset <name> to specify a preset.');
      logger.info('Available presets: ' + available.join(', '));
      logger.info('Example: kiro-kit init --preset backend');
    } else {
      logger.info('No presets selected. Exiting.');
    }
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // 4. Load presets + confirm file count
  // -------------------------------------------------------------------------
  const presets = loadAll(selectedNames);
  const totalFiles = presets.reduce((n, p) => n + p.manifest.files.length, 0);

  if (!opts.yes) {
    const confirmed = await prompt.confirm(
      `About to write ${totalFiles} files into .kiro/ and workspace. Continue?`,
      true,
    );
    if (!confirmed) {
      logger.info('Cancelled.');
      process.exit(0);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Determine conflict mode
  // -------------------------------------------------------------------------
  let mode: ConflictMode = 'interactive';
  if (opts.force) mode = 'force';
  else if (opts.skipExisting) mode = 'skip-existing';
  else if (opts.yes) mode = 'skip-existing';

  // -------------------------------------------------------------------------
  // 5b. Plan writes + resolve all interactive questions BEFORE the runner.
  //     The listr2 spinner owns the terminal while tasks run; any prompt
  //     rendered underneath it is invisible and the CLI appears to hang.
  // -------------------------------------------------------------------------
  const sessionState: SessionState = { overwriteAll: false };
  const plannedWrites = planRegularWrites(presets, workspaceRoot);
  const preResolved = new Map<string, ConflictAction>();

  if (mode === 'interactive') {
    for (const w of plannedWrites) {
      if (!fs.existsSync(w.targetPath)) continue;
      const sourceContent = fs.readFileSync(w.sourcePath);
      const action = await resolveConflict({
        target: w.targetPath,
        sourceContent,
        mode,
        sessionState,
        prompt: (target) => prompt.conflictChoice(path.relative(workspaceRoot, target)),
        showDiff: (t, s) => showDiff(t, s),
      });
      if (action === 'SKIP' || action === 'OVERWRITE_WITH_BACKUP') {
        preResolved.set(w.targetPath, action);
      }
    }
  }

  // Pre-load Powers and ask the tier/MCP questions now (outside the spinner)
  let mergedPowers: PowerEntry[] = [];
  let powersPromptResult: PowersPromptResult | null = null;
  let confirmMCPWrite = true;

  if (opts.powers !== 'none') {
    const allPowerEntries = presets.map((p) => {
      const result = loadPowers(p.dir);
      if (!result.ok) {
        logger.warn(`Powers: ${result.error}`);
      }
      return result.powers;
    });
    mergedPowers = mergePowers(allPowerEntries);

    if (mergedPowers.length > 0) {
      powersPromptResult = await promptPowersTier(mergedPowers, {
        powersFlag: opts.powers,
        yes: opts.yes,
      });
      if (powersPromptResult.confirmMCP && !opts.yes) {
        confirmMCPWrite = await prompt.confirm('Configure MCP servers in .mcp.json?', true);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Build initial context and task runner
  // -------------------------------------------------------------------------
  const initialCtx: InitTaskContext = {
    workspaceRoot,
    selectedNames,
    opts,
    timestamp: generateTimestamp(),
    mode,
    sessionState,
    allTrackedFiles: [],
    filesWritten: 0,
    filesSkipped: 0,
    setupGuideWritten: false,
    envExampleWritten: false,
    plannedWrites,
    preResolved,
    mergedPowers,
    powersPromptResult,
    confirmMCPWrite,
  };

  const tasks = buildInitTasks(presets, opts);
  const runner = await createTaskRunner(tasks, capability, theme);

  // -------------------------------------------------------------------------
  // 7. Run tasks
  // -------------------------------------------------------------------------
  const result = await runner.run(initialCtx);

  // -------------------------------------------------------------------------
  // 7b. Opt-in: install real Kiro Powers (user-global, needs Kiro closed).
  //     Interactive only — never as a silent side effect of --yes/CI.
  // -------------------------------------------------------------------------
  if (!opts.yes && capability.isTTY && opts.powers !== 'none' && kiroPowersAvailable()) {
    const powerNames = powersForPresets(selectedNames);
    if (powerNames.length > 0) {
      if (isKiroRunning()) {
        logger.info(
          `${powerNames.length} Kiro Power(s) are available for these presets. ` +
            `Close Kiro, then run \`kiro-kit powers install --preset ${selectedNames[0]}\` to install them.`,
        );
      } else {
        const yes = await prompt.confirm(
          `Install ${powerNames.length} recommended Kiro Power(s) now (${powerNames.join(', ')})?`,
          false,
        );
        if (yes) {
          const installResults = installPowers(powerNames);
          const n = installResults.filter((r) => r.status === 'installed').length;
          logger.success(`Installed ${n} Power(s). Restart Kiro to see them.`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. Render summary
  // -------------------------------------------------------------------------
  screens.summary({
    filesWritten: result.filesWritten,
    filesSkipped: result.filesSkipped,
    presets: selectedNames,
    setupGuidePath: result.setupGuideWritten ? '.kiro/POWERS-SETUP.md' : undefined,
    envExamplePath: result.envExampleWritten ? '.env.example' : undefined,
    nextSteps: [
      'Open Kiro IDE in this directory',
      'Run `kiro-kit doctor` to verify the workspace',
      ...(result.setupGuideWritten
        ? ['Read .kiro/POWERS-SETUP.md for Powers configuration']
        : []),
    ],
    docsUrl: 'https://github.com/ihatesea69/kiro-kit',
  });
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `init` command on the given Commander program.
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
    .option(
      '--powers <mode>',
      'Powers setup mode: none, all, or interactive (default)',
      'interactive',
    )
    .option('--quiet', 'Suppress non-essential output including Powers recommendations')
    .action(async (opts: InitOptions) => {
      // Register SIGINT handler for exit code 130
      process.once('SIGINT', () => {
        process.exit(130);
      });

      try {
        await runInit(opts);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'SIGINT') {
          process.exit(130);
        }

        // Attempt to render error box via UI layer; fall back to logger
        try {
          const capability = detectCapability(process.env, process.argv, process.stdout);
          const theme = await createTheme(capability);
          const screens = await createInitScreens({
            capability,
            theme,
            cliVersion: getKitVersion(),
          });
          screens.errorBox(err instanceof Error ? err : new Error(String(err)));
        } catch {
          logger.error(err instanceof Error ? err.message : String(err));
        }

        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Build the lines for one render frame as plain strings.
 * Kept for backward compatibility with existing unit tests.
 * @deprecated Use ThemedPrompt.multiPickPresets instead.
 */
export function buildRenderLines(
  items: Array<{ name: string; description: string }>,
  cursor: number,
  selected: Set<number>,
  columns?: number,
): string[] {
  const cols = columns ?? process.stdout.columns ?? 80;
  const maxDescWidth = Math.max(0, cols - 23);

  const lines: string[] = [];
  lines.push('? Select presets to install: (Space to select, <a> toggle all, Enter to confirm)');

  for (let i = 0; i < items.length; i++) {
    const marker = cursor === i ? '>' : ' ';
    const check = selected.has(i) ? '[x]' : '[ ]';
    const name = items[i].name.padEnd(12);
    const rawDesc = items[i].description;
    const truncated =
      rawDesc.length > maxDescWidth
        ? rawDesc.slice(0, Math.max(0, maxDescWidth - 1)) + '\u2026'
        : rawDesc;
    lines.push(`  ${marker} ${check} ${name} - ${truncated}`);
  }

  return lines;
}
