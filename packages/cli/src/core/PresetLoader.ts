import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, validate, type Manifest } from './ManifestParser.js';
import { KKError, ErrorCodes } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getPresetsDir(): string {
  // In bundled dist: dist/presets/
  // In dev: ../../presets/
  const bundled = path.resolve(__dirname, '../presets');
  if (fs.existsSync(bundled)) return bundled;
  const dev = path.resolve(__dirname, '../../../../presets');
  if (fs.existsSync(dev)) return dev;
  throw new KKError(
    ErrorCodes.PRESET_NOT_FOUND,
    'Cannot locate presets directory.',
    'Ensure kiro-kit is installed correctly.',
  );
}

export interface LoadedPreset {
  manifest: Manifest;
  dir: string;
}

/**
 * Load a single preset by name.
 */
export function load(name: string): LoadedPreset {
  const presetsDir = getPresetsDir();
  const presetDir = path.join(presetsDir, name);

  if (!fs.existsSync(presetDir)) {
    throw new KKError(
      ErrorCodes.PRESET_NOT_FOUND,
      `Preset "${name}" not found.`,
      `Available presets: ${listAvailable().join(', ')}`,
    );
  }

  const manifestPath = path.join(presetDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new KKError(
      ErrorCodes.PRESET_LOAD_FAILED,
      `Preset "${name}" is missing manifest.json.`,
    );
  }

  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const result = parse(raw);

  if (!result.ok) {
    throw new KKError(
      ErrorCodes.PRESET_LOAD_FAILED,
      `Preset "${name}" manifest parse error: ${result.error.message}`,
    );
  }

  return { manifest: result.value, dir: presetDir };
}

/**
 * Load multiple presets by name.
 */
export function loadAll(names: string[]): LoadedPreset[] {
  return names.map((n) => load(n));
}

/**
 * List all available preset names from the presets directory.
 */
export function listAvailable(): string[] {
  const presetsDir = getPresetsDir();
  try {
    return fs
      .readdirSync(presetsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => !d.name.startsWith('_'))
      .filter((d) =>
        fs.existsSync(path.join(presetsDir, d.name, 'manifest.json')),
      )
      .map((d) => d.name);
  } catch {
    return [];
  }
}
