import fs from 'node:fs';
import path from 'node:path';
import { KKError, ErrorCodes } from './errors.js';
import { logger } from '../utils/logger.js';
import { atomicWrite } from '../utils/fs-safe.js';

const TRACKING_FILE = '.kiro/.kiro-kit.json';

export interface TrackedFile {
  target: string;
  sourcePreset: string;
  contentHash: string;
  installedAt: string;
}

export interface TrackedPreset {
  name: string;
  version: string;
  installedAt: string;
  updatedAt?: string;
  files: TrackedFile[];
}

export interface TrackingData {
  kitVersion: string;
  installedAt: string;
  updatedAt?: string;
  presets: TrackedPreset[];
}

function getTrackingPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, TRACKING_FILE);
}

/**
 * Read tracking data from .kiro/.kiro-kit.json.
 * Returns null if file doesn't exist.
 * Throws KK040 if file is corrupt.
 */
export function read(workspaceRoot: string): TrackingData | null {
  const filePath = getTrackingPath(workspaceRoot);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw) as TrackingData;
  } catch {
    logger.warn(`Tracking file is corrupt: ${filePath}`);
    throw new KKError(
      ErrorCodes.TRACKING_CORRUPT,
      'Tracking file .kiro/.kiro-kit.json is corrupt (invalid JSON).',
      'Delete the file and re-run kiro-kit init to regenerate.',
    );
  }
}

/**
 * Write tracking data to .kiro/.kiro-kit.json.
 * Creates directory if needed.
 */
export function write(workspaceRoot: string, data: TrackingData): void {
  const filePath = getTrackingPath(workspaceRoot);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  atomicWrite(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Add or update a preset in tracking data.
 */
export function upsertPreset(
  data: TrackingData,
  preset: TrackedPreset,
): TrackingData {
  const existing = data.presets.findIndex((p) => p.name === preset.name);
  if (existing >= 0) {
    data.presets[existing] = preset;
  } else {
    data.presets.push(preset);
  }
  data.updatedAt = new Date().toISOString();
  return data;
}

/**
 * Create initial tracking data.
 */
export function createInitial(kitVersion: string): TrackingData {
  return {
    kitVersion,
    installedAt: new Date().toISOString(),
    presets: [],
  };
}

/**
 * Get a preset from tracking data by name.
 */
export function getPreset(
  data: TrackingData,
  name: string,
): TrackedPreset | undefined {
  return data.presets.find((p) => p.name === name);
}
