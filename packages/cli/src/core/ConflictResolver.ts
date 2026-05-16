import fs from 'node:fs';
import crypto from 'node:crypto';

export type ConflictAction =
  | 'WRITE_NEW'
  | 'OVERWRITE_WITH_BACKUP'
  | 'SKIP'
  | 'NO_OP';

export type ConflictMode = 'interactive' | 'force' | 'skip-existing';

export interface SessionState {
  overwriteAll: boolean;
}

export interface ConflictPromptFn {
  (target: string): Promise<'overwrite' | 'skip' | 'view-diff' | 'overwrite-all'>;
}

export interface DiffViewerFn {
  (target: string, sourceContent: Buffer): void;
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Resolve file conflict based on mode and session state.
 */
export async function resolve(opts: {
  target: string;
  sourceContent: Buffer;
  mode: ConflictMode;
  sessionState: SessionState;
  prompt?: ConflictPromptFn;
  showDiff?: DiffViewerFn;
}): Promise<ConflictAction> {
  const { target, sourceContent, mode, sessionState, prompt, showDiff } = opts;

  // File doesn't exist yet - write new
  if (!fs.existsSync(target)) {
    return 'WRITE_NEW';
  }

  // Compare hashes
  const currentContent = fs.readFileSync(target);
  const currentHash = sha256(currentContent);
  const newHash = sha256(sourceContent);

  // Byte-equal - no operation needed
  if (currentHash === newHash) {
    return 'NO_OP';
  }

  // Force mode - always overwrite with backup
  if (mode === 'force') {
    return 'OVERWRITE_WITH_BACKUP';
  }

  // Skip-existing mode - never overwrite
  if (mode === 'skip-existing') {
    return 'SKIP';
  }

  // Session overwrite-all already set
  if (sessionState.overwriteAll) {
    return 'OVERWRITE_WITH_BACKUP';
  }

  // Interactive mode - prompt user
  if (!prompt) {
    // No prompt function provided, default to skip
    return 'SKIP';
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const choice = await prompt(target);

    switch (choice) {
      case 'view-diff':
        if (showDiff) {
          showDiff(target, sourceContent);
        }
        continue;
      case 'overwrite':
        return 'OVERWRITE_WITH_BACKUP';
      case 'skip':
        return 'SKIP';
      case 'overwrite-all':
        sessionState.overwriteAll = true;
        return 'OVERWRITE_WITH_BACKUP';
    }
  }
}
