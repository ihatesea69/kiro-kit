import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolve, type SessionState, type ConflictPromptFn } from '../../src/core/ConflictResolver.js';

describe('ConflictResolver', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-conflict-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeSession(): SessionState {
    return { overwriteAll: false };
  }

  it('returns WRITE_NEW when file does not exist', async () => {
    const target = path.join(tmpDir, 'new-file.txt');
    const result = await resolve({
      target,
      sourceContent: Buffer.from('hello'),
      mode: 'interactive',
      sessionState: makeSession(),
    });
    expect(result).toBe('WRITE_NEW');
  });

  it('returns NO_OP when file is byte-equal', async () => {
    const target = path.join(tmpDir, 'same.txt');
    const content = Buffer.from('identical content');
    fs.writeFileSync(target, content);

    const result = await resolve({
      target,
      sourceContent: content,
      mode: 'interactive',
      sessionState: makeSession(),
    });
    expect(result).toBe('NO_OP');
  });

  it('returns OVERWRITE_WITH_BACKUP in force mode', async () => {
    const target = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(target, 'old content');

    const result = await resolve({
      target,
      sourceContent: Buffer.from('new content'),
      mode: 'force',
      sessionState: makeSession(),
    });
    expect(result).toBe('OVERWRITE_WITH_BACKUP');
  });

  it('returns SKIP in skip-existing mode', async () => {
    const target = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(target, 'old content');

    const result = await resolve({
      target,
      sourceContent: Buffer.from('new content'),
      mode: 'skip-existing',
      sessionState: makeSession(),
    });
    expect(result).toBe('SKIP');
  });

  it('returns OVERWRITE_WITH_BACKUP when session overwriteAll is set', async () => {
    const target = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(target, 'old content');

    const session = makeSession();
    session.overwriteAll = true;

    const result = await resolve({
      target,
      sourceContent: Buffer.from('new content'),
      mode: 'interactive',
      sessionState: session,
    });
    expect(result).toBe('OVERWRITE_WITH_BACKUP');
  });

  it('handles interactive overwrite choice', async () => {
    const target = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(target, 'old content');

    const prompt: ConflictPromptFn = async () => 'overwrite';

    const result = await resolve({
      target,
      sourceContent: Buffer.from('new content'),
      mode: 'interactive',
      sessionState: makeSession(),
      prompt,
    });
    expect(result).toBe('OVERWRITE_WITH_BACKUP');
  });

  it('handles interactive skip choice', async () => {
    const target = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(target, 'old content');

    const prompt: ConflictPromptFn = async () => 'skip';

    const result = await resolve({
      target,
      sourceContent: Buffer.from('new content'),
      mode: 'interactive',
      sessionState: makeSession(),
      prompt,
    });
    expect(result).toBe('SKIP');
  });

  it('handles interactive overwrite-all and sets session state', async () => {
    const target = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(target, 'old content');

    const session = makeSession();
    const prompt: ConflictPromptFn = async () => 'overwrite-all';

    const result = await resolve({
      target,
      sourceContent: Buffer.from('new content'),
      mode: 'interactive',
      sessionState: session,
      prompt,
    });
    expect(result).toBe('OVERWRITE_WITH_BACKUP');
    expect(session.overwriteAll).toBe(true);
  });

  it('handles view-diff then overwrite', async () => {
    const target = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(target, 'old content');

    let callCount = 0;
    const prompt: ConflictPromptFn = async () => {
      callCount++;
      return callCount === 1 ? 'view-diff' : 'overwrite';
    };

    let diffCalled = false;
    const showDiff = () => { diffCalled = true; };

    const result = await resolve({
      target,
      sourceContent: Buffer.from('new content'),
      mode: 'interactive',
      sessionState: makeSession(),
      prompt,
      showDiff,
    });
    expect(result).toBe('OVERWRITE_WITH_BACKUP');
    expect(diffCalled).toBe(true);
  });
});
