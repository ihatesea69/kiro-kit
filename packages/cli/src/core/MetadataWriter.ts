import fs from 'node:fs';
import path from 'node:path';

const METADATA_FILE = '.kiro/metadata.json';

export interface PresetMeta {
  name: string;
  version: string;
}

export interface Metadata {
  version: string;
  name: string;
  description: string;
  buildDate: string;
  repository: string;
  presets: PresetMeta[];
  installedAt: string;
  kitVersion: string;
}

/**
 * Compose metadata from installed presets and kit info.
 */
export function compose(opts: {
  kitVersion: string;
  repository: string;
  presets: PresetMeta[];
}): Metadata {
  return {
    version: '1.0.0',
    name: 'kiro-kit',
    description: 'Kiro IDE workspace bootstrapped by kiro-kit.',
    buildDate: new Date().toISOString(),
    repository: opts.repository,
    presets: opts.presets,
    installedAt: new Date().toISOString(),
    kitVersion: opts.kitVersion,
  };
}

/**
 * Write metadata.json to workspace.
 * When installing multiple presets, merges preset list.
 */
export function write(workspaceRoot: string, metadata: Metadata): void {
  const filePath = path.join(workspaceRoot, METADATA_FILE);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
}

/**
 * Read existing metadata, or return null if not present.
 */
export function read(workspaceRoot: string): Metadata | null {
  const filePath = path.join(workspaceRoot, METADATA_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Metadata;
  } catch {
    return null;
  }
}

/**
 * Merge new presets into existing metadata (dedup by name).
 */
export function mergePresets(existing: Metadata, newPresets: PresetMeta[]): Metadata {
  const merged = [...(existing.presets || [])];
  for (const p of newPresets) {
    const idx = merged.findIndex((m) => m.name === p.name);
    if (idx >= 0) {
      merged[idx] = p;
    } else {
      merged.push(p);
    }
  }
  return { ...existing, presets: merged, buildDate: new Date().toISOString() };
}
