import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { KKError, ErrorCodes } from './errors.js';

const ArtifactTypeSchema = z.enum([
  'steering', 'hook', 'mcp', 'skill', 'agent',
  'command', 'workflow', 'statusline', 'metadata',
  'settings', 'env', 'spec', 'docs', 'doc', 'config', 'other',
]);

const PresetNameSchema = z.enum([
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai',
]);

const FileEntrySchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: ArtifactTypeSchema,
  executable: z.boolean().optional(),
});

const MCPServerDefSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const HookEntrySchema = z.union([
  z.object({
    matcher: z.string().optional(),
    command: z.string().min(1),
  }),
  z.string().min(1),
]);

const ManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  category: PresetNameSchema,
  files: z.array(FileEntrySchema).min(1),
  dependencies: z.array(PresetNameSchema).optional(),
  mcpServers: z.record(MCPServerDefSchema).optional(),
  hooks: z.object({
    PreToolUse: z.array(HookEntrySchema).optional(),
    PostToolUse: z.array(HookEntrySchema).optional(),
    agentStop: z.array(HookEntrySchema).optional(),
    fileEdited: z.array(HookEntrySchema).optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  minCounts: z.object({
    agents: z.number().int().nonnegative().optional(),
    skills: z.number().int().nonnegative().optional(),
    commands: z.number().int().nonnegative().optional(),
    hooks: z.number().int().nonnegative().optional(),
    workflows: z.number().int().nonnegative().optional(),
  }).optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type FileEntry = z.infer<typeof FileEntrySchema>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export interface ManifestError {
  code: string;
  message: string;
}

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Parse raw JSON string into a validated Manifest.
 */
export function parse(json: string): Result<Manifest, ManifestError> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {
      ok: false,
      error: {
        code: ErrorCodes.MANIFEST_INVALID,
        message: 'Manifest is not valid JSON.',
      },
    };
  }

  const result = ManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return {
      ok: false,
      error: {
        code: ErrorCodes.MANIFEST_MISSING_FIELD,
        message: `Manifest schema validation failed: ${issues}`,
      },
    };
  }

  return { ok: true, value: result.data };
}

/**
 * Pretty-print a Manifest object as JSON (2-space indent).
 */
export function print(m: Manifest): string {
  return JSON.stringify(m, null, 2);
}

/**
 * Validate a parsed Manifest against its preset directory on disk.
 * Checks:
 * 1. File completeness: every file in manifest.files exists at presetDir/source
 * 2. No-orphan: every file in presetDir (except manifest.json, README.md) is declared in manifest.files
 */
export function validate(m: Manifest, presetDir: string): Result<void, ManifestError[]> {
  const errors: ManifestError[] = [];

  // 1. File completeness check
  for (const entry of m.files) {
    const fullPath = path.join(presetDir, entry.source);
    if (!fs.existsSync(fullPath)) {
      errors.push({
        code: ErrorCodes.MANIFEST_INCOMPLETE,
        message: `File declared in manifest not found on disk: ${entry.source}`,
      });
    }
  }

  // 2. No-orphan check
  const declaredSources = new Set(m.files.map((f) => f.source));
  const ignoredFiles = new Set(['manifest.json', 'README.md']);

  const walkDir = (dir: string, prefix: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walkDir(path.join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        if (!ignoredFiles.has(rel) && !declaredSources.has(rel)) {
          errors.push({
            code: ErrorCodes.MANIFEST_ORPHAN_FILE,
            message: `File on disk not declared in manifest (orphan): ${rel}`,
          });
        }
      }
    }
  };

  walkDir(presetDir, '');

  if (errors.length > 0) {
    return { ok: false, error: errors };
  }
  return { ok: true, value: undefined };
}
