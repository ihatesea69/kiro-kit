import fs from 'node:fs';
import path from 'node:path';
import type { ConflictMode, SessionState } from '../ConflictResolver.js';
import { resolve as resolveConflict } from '../ConflictResolver.js';
import type { ConflictPromptFn, DiffViewerFn } from '../ConflictResolver.js';

export interface HookMergeResult {
  written: string[];
  skipped: string[];
  noOp: string[];
}

/**
 * Merge hook files from preset into workspace .kiro/hooks/.
 * Deduplication by filename (case-sensitive).
 * Conflicts delegate to ConflictResolver.
 * User-created hooks (not in manifest) are preserved.
 */
export async function mergeHooks(opts: {
  presetHookFiles: Array<{ source: string; targetPath: string }>;
  workspaceRoot: string;
  mode: ConflictMode;
  sessionState: SessionState;
  prompt?: ConflictPromptFn;
  showDiff?: DiffViewerFn;
  backupFn?: (target: string) => void;
}): Promise<HookMergeResult> {
  const { presetHookFiles, workspaceRoot, mode, sessionState, prompt, showDiff, backupFn } = opts;
  const result: HookMergeResult = { written: [], skipped: [], noOp: [] };

  for (const { source, targetPath } of presetHookFiles) {
    const fullTarget = path.resolve(workspaceRoot, targetPath);
    const sourceContent = fs.readFileSync(source);

    const action = await resolveConflict({
      target: fullTarget,
      sourceContent,
      mode,
      sessionState,
      prompt,
      showDiff,
    });

    switch (action) {
      case 'WRITE_NEW':
      case 'OVERWRITE_WITH_BACKUP':
        if (action === 'OVERWRITE_WITH_BACKUP' && backupFn) {
          backupFn(fullTarget);
        }
        fs.mkdirSync(path.dirname(fullTarget), { recursive: true });
        fs.writeFileSync(fullTarget, sourceContent);
        result.written.push(targetPath);
        break;
      case 'SKIP':
        result.skipped.push(targetPath);
        break;
      case 'NO_OP':
        result.noOp.push(targetPath);
        break;
    }
  }

  return result;
}
