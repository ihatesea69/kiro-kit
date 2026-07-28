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

/**
 * Hash content for equality comparison, normalizing line endings for text so
 * that a CRLF-on-disk file (written with os.EOL by atomicWrite) compares equal
 * to its LF preset source. Binary content (contains a NUL byte) is hashed raw.
 */
function contentHash(data: Buffer): string {
  const isBinary = data.includes(0);
  const normalized = isBinary
    ? data
    : Buffer.from(
        data.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
        'utf-8',
      );
  return crypto.createHash('sha256').update(normalized).digest('hex');
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

  // Compare hashes. Read the target directly and treat a missing file as
  // "write new" — this also closes the TOCTOU gap between an existsSync check
  // and the read (the file may be deleted in between).
  let currentContent: Buffer;
  try {
    currentContent = fs.readFileSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'WRITE_NEW';
    }
    throw err;
  }
  const currentHash = contentHash(currentContent);
  const newHash = contentHash(sourceContent);

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
