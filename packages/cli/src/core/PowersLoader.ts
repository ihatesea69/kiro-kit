import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * PowersLoader — reads and validates `powers.json` from preset directories.
 *
 * Provides tier-based filtering and multi-preset merge with deduplication.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const PowerTierSchema = z.enum(['essential', 'recommended', 'optional']);

export const PowerCategorySchema = z.enum([
  'hosting', 'database', 'auth', 'payments', 'observability',
  'design', 'testing', 'ai', 'infra', 'docs', 'other',
]);

export const PowerAuthSchema = z.enum(['none', 'apiKey', 'oauth']);

export const PowerEntrySchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().min(1),
  tier: PowerTierSchema,
  // Enriched metadata — all optional for backward compatibility with existing
  // powers.json files that only carry the four core fields.
  category: PowerCategorySchema.optional(),
  auth: PowerAuthSchema.optional(),
  envVars: z.array(z.string()).optional(),
  mcpBacked: z.boolean().optional(),
});

export const PowersConfigSchema = z.object({
  powers: z.array(PowerEntrySchema),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PowerTier = z.infer<typeof PowerTierSchema>;
export type PowerCategory = z.infer<typeof PowerCategorySchema>;
export type PowerAuth = z.infer<typeof PowerAuthSchema>;
export type PowerEntry = z.infer<typeof PowerEntrySchema>;
export type PowersConfig = z.infer<typeof PowersConfigSchema>;

export interface LoadPowersResult {
  ok: boolean;
  powers: PowerEntry[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POWERS_FILENAME = 'powers.json';

/** Priority order: lower index = higher priority. */
const TIER_PRIORITY: Record<PowerTier, number> = {
  essential: 0,
  recommended: 1,
  optional: 2,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load powers.json from a preset directory.
 * Returns empty array if file doesn't exist (graceful degradation).
 * Returns error result (not throw) for invalid JSON or schema failures.
 */
export function loadPowers(presetDir: string): LoadPowersResult {
  const filePath = path.join(presetDir, POWERS_FILENAME);

  if (!fs.existsSync(filePath)) {
    return { ok: true, powers: [] };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, powers: [], error: `Failed to read ${POWERS_FILENAME}: ${message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, powers: [], error: `${POWERS_FILENAME} is not valid JSON.` };
  }

  const result = PowersConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return { ok: false, powers: [], error: `${POWERS_FILENAME} schema validation failed: ${issues}` };
  }

  return { ok: true, powers: result.data.powers };
}

/**
 * Merge powers from multiple presets, deduplicating by name.
 * When duplicates exist, keep the entry with the highest tier
 * (essential > recommended > optional).
 */
export function mergePowers(configs: PowerEntry[][]): PowerEntry[] {
  const seen = new Map<string, PowerEntry>();

  for (const entries of configs) {
    for (const entry of entries) {
      const existing = seen.get(entry.name);
      if (!existing) {
        seen.set(entry.name, entry);
      } else if (TIER_PRIORITY[entry.tier] < TIER_PRIORITY[existing.tier]) {
        // New entry has higher priority tier — replace.
        seen.set(entry.name, entry);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Filter powers by tier selection.
 * Returns only those powers whose tier is in the provided list.
 */
export function filterByTier(powers: PowerEntry[], tiers: PowerTier[]): PowerEntry[] {
  const tierSet = new Set<PowerTier>(tiers);
  return powers.filter((p) => tierSet.has(p.tier));
}
