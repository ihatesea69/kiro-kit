import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * PowerInstaller — installs real Kiro Powers by replicating what the IDE does:
 *   1. shallow-clone the power's git repo into ~/.kiro/powers/repos/<name>/
 *   2. copy the power folder (pathInRepo) into ~/.kiro/powers/installed/<name>/
 *   3. register it in ~/.kiro/powers/installed.json
 *
 * Only powers from the hardcoded, trusted CATALOG below can be installed — the
 * command never clones an arbitrary user-supplied URL. installed.json is backed
 * up before any change, and the operation is reversible.
 *
 * Note: Powers that rely on an MCP server won't expose tools while a Kiro org
 * has MCP disabled, but their POWER.md steering still applies.
 */

export interface PowerSpec {
  displayName: string;
  cloneUrl: string;
  pathInRepo: string;
  registryId: string;
  presets: string[];
}

/**
 * Curated catalog of real Kiro Powers (verified to exist in their registries),
 * mapped to the presets they are relevant to. Extend as more powers are verified.
 */
export const POWER_CATALOG: Record<string, PowerSpec> = {
  neon: {
    displayName: 'Neon (serverless Postgres)',
    cloneUrl: 'https://github.com/kirodotdev/powers',
    pathInRepo: 'neon',
    registryId: 'kiro-recommended',
    presets: ['backend', 'fullstack', 'data-ai'],
  },
  postman: {
    displayName: 'Postman (API testing)',
    cloneUrl: 'https://github.com/kirodotdev/powers',
    pathInRepo: 'postman',
    registryId: 'kiro-recommended',
    presets: ['backend', 'fullstack'],
  },
  stripe: {
    displayName: 'Stripe (payments)',
    cloneUrl: 'https://github.com/kirodotdev/powers',
    pathInRepo: 'stripe',
    registryId: 'kiro-recommended',
    presets: ['fullstack', 'backend'],
  },
  datadog: {
    displayName: 'Datadog (observability)',
    cloneUrl: 'https://github.com/kirodotdev/powers',
    pathInRepo: 'datadog',
    registryId: 'kiro-recommended',
    presets: ['devops'],
  },
  terraform: {
    displayName: 'Terraform (IaC)',
    cloneUrl: 'https://github.com/kirodotdev/powers',
    pathInRepo: 'terraform',
    registryId: 'kiro-recommended',
    presets: ['devops'],
  },
  'aws-infrastructure-as-code': {
    displayName: 'AWS Infrastructure as Code',
    cloneUrl: 'https://github.com/kirodotdev/powers',
    pathInRepo: 'aws-infrastructure-as-code',
    registryId: 'kiro-recommended',
    presets: ['devops'],
  },
  figma: {
    displayName: 'Figma (design to code)',
    cloneUrl: 'https://github.com/figma/mcp-server-guide',
    pathInRepo: 'figma-power',
    registryId: 'kiro-recommended',
    presets: ['frontend', 'fullstack', 'mobile'],
  },
  'supabase-hosted': {
    displayName: 'Supabase (hosted)',
    cloneUrl: 'https://github.com/supabase-community/kiro-powers',
    pathInRepo: 'powers/supabase-hosted',
    registryId: 'kiro-recommended',
    presets: ['backend', 'fullstack'],
  },
};

export interface InstalledPowersFile {
  version: string;
  installedPowers: Array<{ name: string; registryId: string }>;
  dismissedAutoInstalls: string[];
}

export interface InstallResult {
  name: string;
  status: 'installed' | 'already' | 'skipped' | 'error';
  message?: string;
}

function powersDir(): string {
  return path.join(os.homedir(), '.kiro', 'powers');
}

/** Whether the user's machine has a Kiro powers directory. */
export function kiroPowersAvailable(): boolean {
  return fs.existsSync(powersDir());
}

/** Best-effort check whether the Kiro IDE is currently running. */
export function isKiroRunning(): boolean {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Kiro.exe'], {
        encoding: 'utf-8',
      });
      return /Kiro\.exe/i.test(out);
    }
    const out = execFileSync('pgrep', ['-if', 'kiro'], { encoding: 'utf-8' });
    return out.trim().length > 0;
  } catch {
    return false; // tool missing or no match
  }
}

/** Resolve the set of catalog power names relevant to the given presets. */
export function powersForPresets(presetNames: string[]): string[] {
  const set = new Set(presetNames);
  return Object.entries(POWER_CATALOG)
    .filter(([, spec]) => spec.presets.some((p) => set.has(p)))
    .map(([name]) => name);
}

function readInstalled(): InstalledPowersFile {
  const file = path.join(powersDir(), 'installed.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as InstalledPowersFile;
  } catch {
    return { version: '1.0.0', installedPowers: [], dismissedAutoInstalls: [] };
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Install the named powers into the user's Kiro powers directory.
 * Unknown or already-installed powers are reported, not fatal.
 */
export function installPowers(names: string[]): InstallResult[] {
  const dir = powersDir();
  const installedDir = path.join(dir, 'installed');
  const reposDir = path.join(dir, 'repos');
  const installedJson = path.join(dir, 'installed.json');

  const data = readInstalled();
  const already = new Set(data.installedPowers.map((p) => p.name));

  // Back up installed.json once before touching anything.
  if (fs.existsSync(installedJson)) {
    fs.copyFileSync(installedJson, `${installedJson}.bak`);
  }

  const results: InstallResult[] = [];
  let changed = false;

  for (const name of names) {
    const spec = POWER_CATALOG[name];
    if (!spec) {
      results.push({ name, status: 'skipped', message: 'not in catalog' });
      continue;
    }
    if (already.has(name)) {
      results.push({ name, status: 'already' });
      continue;
    }

    const repoDir = path.join(reposDir, name);
    const activeDir = path.join(installedDir, name);
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.mkdirSync(reposDir, { recursive: true });
      execFileSync('git', ['clone', '--depth', '1', spec.cloneUrl, repoDir], {
        stdio: 'pipe',
      });

      const srcPower = spec.pathInRepo ? path.join(repoDir, spec.pathInRepo) : repoDir;
      if (!fs.existsSync(path.join(srcPower, 'POWER.md'))) {
        fs.rmSync(repoDir, { recursive: true, force: true });
        results.push({ name, status: 'error', message: 'POWER.md not found in repo' });
        continue;
      }

      fs.rmSync(activeDir, { recursive: true, force: true });
      copyDir(srcPower, activeDir);
      data.installedPowers.push({ name, registryId: spec.registryId });
      changed = true;
      results.push({ name, status: 'installed' });
    } catch (err) {
      results.push({
        name,
        status: 'error',
        message: err instanceof Error ? err.message.split('\n')[0] : String(err),
      });
    }
  }

  if (changed) {
    fs.writeFileSync(installedJson, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }
  return results;
}
