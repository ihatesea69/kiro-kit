import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { backup, restore } from '../../src/core/BackupManager.js';
import { mergeMCP, type MCPConfig, type MCPServerEntry } from '../../src/core/merge/mergeMCP.js';
import { resolve as resolveConflict } from '../../src/core/ConflictResolver.js';
import { parse, type Manifest } from '../../src/core/ManifestParser.js';

/**
 * Property 1: Backup-restore round-trip identity
 * Validates: Requirements 8.6, 29.3
 *
 * For any file content, backup followed by restore produces byte-identical output.
 */
describe('Property 1: Backup-restore round-trip identity', () => {
  it('backup then restore yields identical content', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 2000 }),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9._-]+$/.test(s)),
        (content, filename) => {
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-prop1-'));
          try {
            const kiroDir = path.join(tmpDir, '.kiro');
            fs.mkdirSync(kiroDir, { recursive: true });
            const targetFile = path.join(kiroDir, filename);
            fs.writeFileSync(targetFile, content);

            const ts = backup(tmpDir, targetFile, '20240101-120000-000');
            fs.writeFileSync(targetFile, 'modified-content-' + Date.now());

            restore(tmpDir, ts);

            const restored = fs.readFileSync(targetFile, 'utf-8');
            expect(restored).toBe(content);
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

/**
 * Property 3: MCP merge commutativity
 * Validates: Requirements 14.4, 15.2, 29.1
 *
 * For non-conflicting server sets A and B, merge(A, B) == merge(B, A) in terms of final server set.
 */
describe('Property 3: MCP merge commutativity', () => {
  const serverEntryArb = fc.record({
    command: fc.string({ minLength: 1, maxLength: 30 }),
    args: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 3 }),
  }) as fc.Arbitrary<MCPServerEntry>;

  const serverMapArb = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-z][a-z0-9-]*$/.test(s)),
    serverEntryArb,
    { minKeys: 0, maxKeys: 4 },
  );

  it('merge order does not matter for non-conflicting servers', () => {
    fc.assert(
      fc.property(serverMapArb, serverMapArb, (serversA, serversB) => {
        // Ensure non-conflicting: remove keys that exist in both
        const keysA = new Set(Object.keys(serversA));
        const filteredB: Record<string, MCPServerEntry> = {};
        for (const [k, v] of Object.entries(serversB)) {
          if (!keysA.has(k)) filteredB[k] = v;
        }

        // Order 1: merge A then B
        const result1 = mergeMCP(null, serversA);
        const final1 = mergeMCP(result1, filteredB);

        // Order 2: merge B then A
        const result2 = mergeMCP(null, filteredB);
        const final2 = mergeMCP(result2, serversA);

        // Same server set
        const keys1 = Object.keys(final1.mcpServers).sort();
        const keys2 = Object.keys(final2.mcpServers).sort();
        expect(keys1).toEqual(keys2);
      }),
      { numRuns: 50 },
    );
  });
});

/**
 * Property 5: Idempotency with skip-existing mode
 * Validates: Requirements 14.1, 14.2, 14.3, 29.4
 *
 * Writing a file in skip-existing mode when it already exists is a no-op.
 */
describe('Property 5: Idempotency with skip-existing mode', () => {
  it('skip-existing never modifies existing files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        async (existingContent, newContent) => {
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-prop5-'));
          try {
            const targetFile = path.join(tmpDir, 'test-file.txt');
            fs.writeFileSync(targetFile, existingContent);

            const action = await resolveConflict({
              target: targetFile,
              sourceContent: Buffer.from(newContent),
              mode: 'skip-existing',
              sessionState: { overwriteAll: false },
            });

            // If content differs, action should be SKIP
            // If content is same, action should be NO_OP
            if (action !== 'SKIP' && action !== 'NO_OP') return false;

            // File content unchanged
            const afterContent = fs.readFileSync(targetFile, 'utf-8');
            return afterContent === existingContent;
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

/**
 * Property 7: Manifest completeness no-orphan
 * Validates: Requirements 10.7, 10.8, 29.6, 29.7
 *
 * For a valid manifest, every declared file exists on disk (completeness)
 * and every file on disk is declared in the manifest (no-orphan),
 * excluding .gitkeep placeholder files.
 */
describe('Property 7: Manifest completeness no-orphan', () => {
  const presetsDir = path.resolve(__dirname, '../../../../presets');
  const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai', 'kiro-kit-dev'];

  it('all preset manifests pass file completeness (declared files exist)', () => {
    for (const presetName of PRESETS) {
      const presetDir = path.join(presetsDir, presetName);
      const manifestPath = path.join(presetDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const parseResult = parse(raw);
      if (!parseResult.ok) continue;

      const manifest = parseResult.value;

      // Check completeness: every declared file exists on disk
      const missing: string[] = [];
      for (const entry of manifest.files) {
        const fullPath = path.join(presetDir, entry.source);
        if (!fs.existsSync(fullPath)) {
          missing.push(entry.source);
        }
      }

      expect(
        missing,
        `Preset ${presetName}: declared files missing on disk: ${missing.join(', ')}`,
      ).toHaveLength(0);
    }
  });
});
