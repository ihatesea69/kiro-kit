import fs from 'node:fs';
import path from 'node:path';
import { KKError, ErrorCodes } from './errors.js';
import type { MCPPresetConfig } from './MCPConfigurator.js';
import type { PowerEntry } from './PowersLoader.js';

/**
 * EnvTemplateGenerator — generates/updates `.env.example` with environment
 * variables required by MCP servers and Powers.
 *
 * Collects variables from credential-requiring servers, groups them by service,
 * and appends without duplicating existing entries.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvVariable {
  key: string;
  placeholder: string;
  comment: string;
  service: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENV_FILENAME = '.env.example';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect all required env vars from MCP servers that have requiresCredentials=true.
 * Also collects placeholder vars for Powers that may need configuration.
 */
export function collectEnvVars(
  mcpConfig: MCPPresetConfig,
  powers: PowerEntry[],
): EnvVariable[] {
  const vars: EnvVariable[] = [];

  // Collect from MCP servers requiring credentials
  for (const [name, entry] of Object.entries(mcpConfig.servers)) {
    if (!entry.requiresCredentials) {
      continue;
    }

    const envVars = entry.credentialEnvVars ?? [];
    const envMap = entry.env ?? {};

    for (const key of envVars) {
      const placeholder = envMap[key] ?? `your-${key.toLowerCase().replace(/_/g, '-')}`;
      vars.push({
        key,
        placeholder,
        comment: `Required by ${name} MCP server`,
        service: `${name} MCP Server`,
      });
    }
  }

  // Collect from Powers. Prefer the catalog metadata (power.envVars) when present
  // — it is the single source of truth for a Power's required credentials — and
  // fall back to the legacy known-Power mapping otherwise.
  const seen = new Set(vars.map((v) => v.key));
  for (const power of powers) {
    if (power.tier !== 'essential' && power.tier !== 'recommended') {
      continue;
    }
    if (power.auth === 'none') {
      continue; // credential-free Powers need no env entry
    }

    if (power.envVars && power.envVars.length > 0) {
      for (const key of power.envVars) {
        if (seen.has(key)) continue;
        seen.add(key);
        vars.push({
          key,
          placeholder: `your-${key.toLowerCase().replace(/_/g, '-')}`,
          comment: `Required by ${power.name} Power`,
          service: `${power.name} Power`,
        });
      }
      continue;
    }

    for (const envVar of getKnownPowerEnvVars(power.name)) {
      if (seen.has(envVar.key)) continue;
      seen.add(envVar.key);
      vars.push(envVar);
    }
  }

  return vars;
}

/**
 * Parse existing .env.example content to get a Set of existing keys.
 * Ignores comments and blank lines.
 */
export function parseExistingEnv(content: string): Set<string> {
  const keys = new Set<string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    // Extract key from KEY=value or # KEY=value (commented-out vars)
    const match = trimmed.match(/^#?\s*([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      keys.add(match[1]);
    }
  }

  return keys;
}

/**
 * Generate .env.example content, appending new vars without duplicating existing keys.
 * Variables are grouped by service with comment headers.
 */
export function generateEnvTemplate(
  existing: string | null,
  newVars: EnvVariable[],
): string {
  const existingKeys = existing ? parseExistingEnv(existing) : new Set<string>();

  // Filter out vars that already exist
  const varsToAdd = newVars.filter((v) => !existingKeys.has(v.key));

  if (varsToAdd.length === 0) {
    return existing ?? '';
  }

  // Group by service
  const grouped = new Map<string, EnvVariable[]>();
  for (const v of varsToAdd) {
    const group = grouped.get(v.service) ?? [];
    group.push(v);
    grouped.set(v.service, group);
  }

  // Build new content
  const lines: string[] = [];

  for (const [service, vars] of grouped) {
    lines.push(`# ${service}`);
    for (const v of vars) {
      lines.push(`# ${v.comment}`);
      lines.push(`# ${v.key}=${v.placeholder}`);
    }
    lines.push('');
  }

  const newContent = lines.join('\n');

  if (!existing || existing.trim() === '') {
    return newContent;
  }

  // Append to existing content with separator
  const separator = existing.endsWith('\n') ? '' : '\n';
  return existing + separator + '\n' + newContent;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Read existing .env.example from workspace root.
 * Returns null if file does not exist.
 */
export function readExistingEnv(workspaceRoot: string): string | null {
  const filePath = path.join(workspaceRoot, ENV_FILENAME);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write .env.example to workspace root.
 * Throws KKError if write fails.
 */
export function writeEnvTemplate(workspaceRoot: string, content: string): void {
  const filePath = path.join(workspaceRoot, ENV_FILENAME);

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new KKError(
      ErrorCodes.MCP_MERGE_CONFLICT,
      `Failed to write ${ENV_FILENAME}: ${message}`,
      'Check file permissions or create the file manually.',
    );
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Known environment variables for popular Powers.
 * Returns empty array for Powers without known env requirements.
 */
function getKnownPowerEnvVars(powerName: string): EnvVariable[] {
  const mapping: Record<string, EnvVariable[]> = {
    Supabase: [
      {
        key: 'SUPABASE_URL',
        placeholder: 'https://your-project.supabase.co',
        comment: 'Supabase project URL',
        service: 'Supabase Power',
      },
      {
        key: 'SUPABASE_ANON_KEY',
        placeholder: 'your-anon-key',
        comment: 'Supabase anonymous key',
        service: 'Supabase Power',
      },
    ],
    Firebase: [
      {
        key: 'FIREBASE_PROJECT_ID',
        placeholder: 'your-project-id',
        comment: 'Firebase project ID',
        service: 'Firebase Power',
      },
    ],
    Stripe: [
      {
        key: 'STRIPE_SECRET_KEY',
        placeholder: 'sk_test_your-key',
        comment: 'Stripe secret key',
        service: 'Stripe Power',
      },
    ],
    Datadog: [
      {
        key: 'DD_API_KEY',
        placeholder: 'your-datadog-api-key',
        comment: 'Datadog API key',
        service: 'Datadog Power',
      },
    ],
    Neon: [
      {
        key: 'NEON_DATABASE_URL',
        placeholder: 'postgresql://user:password@host/dbname',
        comment: 'Neon database connection string',
        service: 'Neon Power',
      },
    ],
  };

  return mapping[powerName] ?? [];
}
