import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import * as TrackingStore from '../core/TrackingStore.js';
import { logger } from '../utils/logger.js';
import { color } from '../utils/color.js';

interface DoctorOptions {
  fix?: boolean;
}

type CheckResult = 'PASS' | 'FAIL' | 'WARN';

interface CheckReport {
  name: string;
  result: CheckResult;
  message: string;
  fixable?: boolean;
  fixAction?: () => void;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run workspace health checks')
    .option('--fix', 'Auto-fix fixable issues')
    .action((opts: DoctorOptions) => {
      try {
        runDoctor(opts);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function runDoctor(opts: DoctorOptions): void {
  const workspaceRoot = process.cwd();
  const checks: CheckReport[] = [];

  // (a) Node >= 18
  checks.push(checkNodeVersion());

  // (b) .kiro/ exists
  checks.push(checkKiroDir(workspaceRoot));

  // (c) mcp.json valid
  checks.push(checkMcpJson(workspaceRoot));

  // (d) tracking valid
  checks.push(checkTracking(workspaceRoot));

  // (e) tracked files exist
  checks.push(checkTrackedFiles(workspaceRoot));

  // (f) no trailing whitespace in steering front-matter
  checks.push(checkSteeringFrontMatter(workspaceRoot));

  // (g) metadata.json valid
  checks.push(checkMetadataJson(workspaceRoot));

  // (h) statusline exec bit (Unix)
  checks.push(checkStatuslineExecBit(workspaceRoot));

  // (i) native agent hooks are valid JSON with required fields
  checks.push(checkNativeHooks(workspaceRoot));

  // (j) example specs are complete
  checks.push(checkExampleSpecs(workspaceRoot));

  // Print results
  let hasFail = false;
  for (const check of checks) {
    const tag = formatTag(check.result);
    process.stdout.write(`${tag} ${check.message}\n`);

    if (check.result === 'FAIL') hasFail = true;

    // Apply fix if --fix and fixable
    if (opts.fix && check.fixable && check.fixAction) {
      check.fixAction();
      process.stdout.write(`       ${color.green('Fixed!')}\n`);
    }
  }

  process.exit(hasFail ? 1 : 0);
}

function formatTag(result: CheckResult): string {
  switch (result) {
    case 'PASS': return color.green('[PASS]');
    case 'FAIL': return color.red('[FAIL]');
    case 'WARN': return color.yellow('[WARN]');
  }
}

function checkNodeVersion(): CheckReport {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major >= 18) {
    return {
      name: 'node-version',
      result: 'PASS',
      message: `Node.js version >= 18 (${process.version})`,
    };
  }
  return {
    name: 'node-version',
    result: 'FAIL',
    message: `Node.js version >= 18 required (current: ${process.version})`,
  };
}

function checkKiroDir(workspaceRoot: string): CheckReport {
  const kiroDir = path.join(workspaceRoot, '.kiro');
  if (fs.existsSync(kiroDir) && fs.statSync(kiroDir).isDirectory()) {
    return { name: 'kiro-dir', result: 'PASS', message: '.kiro/ directory exists' };
  }
  return {
    name: 'kiro-dir',
    result: 'FAIL',
    message: '.kiro/ directory not found. Run `kiro-kit init` to create it.',
  };
}

function checkMcpJson(workspaceRoot: string): CheckReport {
  const mcpPath = path.join(workspaceRoot, '.kiro/settings/mcp.json');
  if (!fs.existsSync(mcpPath)) {
    return { name: 'mcp-json', result: 'WARN', message: '.kiro/settings/mcp.json not found (optional)' };
  }
  try {
    const content = fs.readFileSync(mcpPath, 'utf-8');
    JSON.parse(content);
    return { name: 'mcp-json', result: 'PASS', message: '.kiro/settings/mcp.json is valid JSON' };
  } catch {
    return {
      name: 'mcp-json',
      result: 'FAIL',
      message: '.kiro/settings/mcp.json is not valid JSON',
      fixable: true,
      fixAction: () => {
        const mcpPath2 = path.join(workspaceRoot, '.kiro/settings/mcp.json');
        fs.writeFileSync(mcpPath2, '{\n  "mcpServers": {}\n}\n', 'utf-8');
      },
    };
  }
}

function checkTracking(workspaceRoot: string): CheckReport {
  const trackingPath = path.join(workspaceRoot, '.kiro/.kiro-kit.json');
  if (!fs.existsSync(trackingPath)) {
    return { name: 'tracking', result: 'WARN', message: '.kiro/.kiro-kit.json not found (no presets installed)' };
  }
  try {
    const content = fs.readFileSync(trackingPath, 'utf-8');
    JSON.parse(content);
    return { name: 'tracking', result: 'PASS', message: '.kiro/.kiro-kit.json is valid' };
  } catch {
    return {
      name: 'tracking',
      result: 'FAIL',
      message: '.kiro/.kiro-kit.json is corrupt (invalid JSON)',
    };
  }
}

function checkTrackedFiles(workspaceRoot: string): CheckReport {
  let tracking: TrackingStore.TrackingData | null;
  try {
    tracking = TrackingStore.read(workspaceRoot);
  } catch {
    return { name: 'tracked-files', result: 'WARN', message: 'Cannot read tracking file, skipping file check' };
  }

  if (!tracking || tracking.presets.length === 0) {
    return { name: 'tracked-files', result: 'PASS', message: 'No tracked files to verify' };
  }

  const missing: string[] = [];
  for (const preset of tracking.presets) {
    for (const file of preset.files) {
      const fullPath = path.resolve(workspaceRoot, file.target);
      if (!fs.existsSync(fullPath)) {
        missing.push(file.target);
      }
    }
  }

  if (missing.length === 0) {
    return { name: 'tracked-files', result: 'PASS', message: 'All tracked files exist on disk' };
  }

  return {
    name: 'tracked-files',
    result: 'FAIL',
    message: `${missing.length} tracked file(s) missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`,
  };
}

function checkSteeringFrontMatter(workspaceRoot: string): CheckReport {
  const steeringDir = path.join(workspaceRoot, '.kiro/steering');
  if (!fs.existsSync(steeringDir)) {
    return { name: 'steering-fm', result: 'PASS', message: 'No steering files to check' };
  }

  const issues: string[] = [];

  const walkDir = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        checkSingleSteering(fullPath, issues);
      }
    }
  };

  walkDir(steeringDir);

  if (issues.length === 0) {
    return { name: 'steering-fm', result: 'PASS', message: 'Steering front-matter has no trailing whitespace' };
  }

  return {
    name: 'steering-fm',
    result: 'WARN',
    message: `${issues.length} steering file(s) have trailing whitespace in front-matter`,
    fixable: true,
    fixAction: () => {
      fixSteeringWhitespace(steeringDir);
    },
  };
}

function checkSingleSteering(filePath: string, issues: string[]): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') return;

    let endIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === '---') { endIdx = i; break; }
    }
    if (endIdx === -1) return;

    // Check for trailing whitespace in front-matter lines
    for (let i = 1; i < endIdx; i++) {
      if (lines[i] !== lines[i].trimEnd()) {
        issues.push(filePath);
        return;
      }
    }
  } catch { /* skip unreadable files */ }
}

function fixSteeringWhitespace(steeringDir: string): void {
  const walkAndFix = (dir: string): void => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkAndFix(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        if (lines[0]?.trim() !== '---') continue;
        let endIdx = -1;
        for (let i = 1; i < lines.length; i++) {
          if (lines[i]?.trim() === '---') { endIdx = i; break; }
        }
        if (endIdx === -1) continue;
        let changed = false;
        for (let i = 1; i < endIdx; i++) {
          const trimmed = lines[i].trimEnd();
          if (lines[i] !== trimmed) { lines[i] = trimmed; changed = true; }
        }
        if (changed) {
          fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
        }
      }
    }
  };
  walkAndFix(steeringDir);
}

function checkMetadataJson(workspaceRoot: string): CheckReport {
  const metaPath = path.join(workspaceRoot, '.kiro/metadata.json');
  if (!fs.existsSync(metaPath)) {
    return { name: 'metadata-json', result: 'WARN', message: '.kiro/metadata.json not found (optional)' };
  }
  try {
    const content = fs.readFileSync(metaPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed.version || !parsed.name) {
      return { name: 'metadata-json', result: 'FAIL', message: '.kiro/metadata.json missing required fields (version, name)' };
    }
    return { name: 'metadata-json', result: 'PASS', message: '.kiro/metadata.json is valid' };
  } catch {
    return { name: 'metadata-json', result: 'FAIL', message: '.kiro/metadata.json is not valid JSON' };
  }
}

/** A single hook entry in the v1 schema. */
interface V1HookEntry {
  name?: unknown;
  trigger?: unknown;
  action?: { type?: unknown; command?: unknown; prompt?: unknown };
}

/** Validate one v1 hook entry: name, trigger, and an action with its required payload. */
function isValidV1Hook(h: V1HookEntry): boolean {
  if (typeof h.name !== 'string' || typeof h.trigger !== 'string') return false;
  const type = h.action?.type;
  if (type === 'agent') return typeof h.action?.prompt === 'string';
  if (type === 'command') return typeof h.action?.command === 'string';
  return false;
}

function checkNativeHooks(workspaceRoot: string): CheckReport {
  const hooksDir = path.join(workspaceRoot, '.kiro/hooks');
  if (!fs.existsSync(hooksDir)) {
    return { name: 'native-hooks', result: 'PASS', message: 'No native hooks to check' };
  }

  const invalid: string[] = [];
  const legacy: string[] = [];
  let checked = 0;

  const walkDir = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      // Retired 0.x format — won't execute in Kiro IDE 1.0. Flag for migration
      // rather than validating against a schema Kiro no longer reads.
      if (entry.name.endsWith('.kiro.hook')) {
        legacy.push(entry.name);
        continue;
      }
      if (!entry.name.endsWith('.json')) continue;

      checked++;
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as {
          hooks?: unknown;
        };
        const hooks = parsed.hooks;
        const ok =
          Array.isArray(hooks) &&
          hooks.length > 0 &&
          hooks.every((h) => isValidV1Hook(h as V1HookEntry));
        if (!ok) invalid.push(entry.name);
      } catch {
        invalid.push(entry.name);
      }
    }
  };

  walkDir(hooksDir);

  if (invalid.length > 0) {
    return {
      name: 'native-hooks',
      result: 'FAIL',
      message: `${invalid.length} native hook(s) invalid: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`,
    };
  }
  if (legacy.length > 0) {
    return {
      name: 'native-hooks',
      result: 'WARN',
      message: `${legacy.length} hook(s) use the retired 0.x .kiro.hook format and will not run in Kiro IDE 1.0: ${legacy.slice(0, 3).join(', ')}${legacy.length > 3 ? '...' : ''}. Re-run \`kiro-kit init\` to install the v1 hooks, then delete them.`,
    };
  }
  if (checked === 0) {
    return { name: 'native-hooks', result: 'PASS', message: 'No native hooks to check' };
  }
  return {
    name: 'native-hooks',
    result: 'PASS',
    message: `All ${checked} native hook(s) are valid`,
  };
}

function checkExampleSpecs(workspaceRoot: string): CheckReport {
  const specsDir = path.join(workspaceRoot, '.kiro/specs');
  if (!fs.existsSync(specsDir)) {
    return { name: 'example-specs', result: 'PASS', message: 'No example specs to check' };
  }

  const required = ['requirements.md', 'design.md', 'tasks.md'];
  const incomplete: string[] = [];
  let checked = 0;

  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(specsDir, { withFileTypes: true });
  } catch {
    return { name: 'example-specs', result: 'WARN', message: 'Cannot read specs directory' };
  }

  // Example specs are direct children named `example-*`.
  for (const entry of dirs) {
    if (!entry.isDirectory() || !entry.name.startsWith('example-')) continue;
    checked++;
    const specPath = path.join(specsDir, entry.name);
    const missing = required.filter((f) => !fs.existsSync(path.join(specPath, f)));
    if (missing.length > 0) incomplete.push(`${entry.name} (missing ${missing.join(', ')})`);
  }

  if (checked === 0) {
    return { name: 'example-specs', result: 'PASS', message: 'No example specs to check' };
  }
  if (incomplete.length === 0) {
    return {
      name: 'example-specs',
      result: 'PASS',
      message: `All ${checked} example spec(s) complete`,
    };
  }
  return {
    name: 'example-specs',
    result: 'FAIL',
    message: `Incomplete example spec(s): ${incomplete.slice(0, 2).join('; ')}`,
  };
}

function checkStatuslineExecBit(workspaceRoot: string): CheckReport {
  // Only relevant on Unix
  if (process.platform === 'win32') {
    return { name: 'statusline-exec', result: 'PASS', message: 'Statusline exec bit check (skipped on Windows)' };
  }

  const shPath = path.join(workspaceRoot, '.kiro/statusline.sh');
  if (!fs.existsSync(shPath)) {
    return { name: 'statusline-exec', result: 'PASS', message: 'No statusline.sh to check' };
  }

  try {
    const stat = fs.statSync(shPath);
    const isExecutable = (stat.mode & 0o111) !== 0;
    if (isExecutable) {
      return { name: 'statusline-exec', result: 'PASS', message: 'statusline.sh is executable' };
    }
    return {
      name: 'statusline-exec',
      result: 'WARN',
      message: 'statusline.sh is not executable',
      fixable: true,
      fixAction: () => {
        fs.chmodSync(shPath, 0o755);
      },
    };
  } catch {
    return { name: 'statusline-exec', result: 'WARN', message: 'Cannot check statusline.sh permissions' };
  }
}
