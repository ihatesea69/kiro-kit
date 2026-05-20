/**
 * ThemedPrompt.ts — Interactive prompt wrapper with theme support.
 *
 * Uses raw readline for multi-select (works in all terminals including IDE).
 * Falls back to non-interactive defaults when stdin is not available.
 */

import readline from 'node:readline';
import type { TerminalCapability } from './capability.js';
import type { ThemeTokens } from './theme.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface MultiSelectChoice {
  name: string;
  description: string;
  selected?: boolean;
  hint?: string;
}

export interface ConflictChoice {
  value: 'overwrite' | 'skip' | 'view-diff' | 'overwrite-all';
  label: string;
}

export interface ThemedPrompt {
  multiPickPresets(items: MultiSelectChoice[]): Promise<string[]>;
  selectTier<T extends string>(
    title: string,
    options: Array<{ value: T; label: string; hint?: string }>,
    defaultIndex?: number,
  ): Promise<T>;
  confirm(message: string, defaultYes?: boolean): Promise<boolean>;
  conflictChoice(targetRel: string): Promise<ConflictChoice['value']>;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateMultiSelectItems(items: MultiSelectChoice[]): void {
  if (items.length < 1) {
    throw new Error('multiPickPresets: items must contain at least one entry');
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.name)) {
      throw new Error(`multiPickPresets: duplicate item name "${item.name}"`);
    }
    seen.add(item.name);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createPrompt(
  capability: TerminalCapability,
  theme: ThemeTokens,
): Promise<ThemedPrompt> {

  // -------------------------------------------------------------------------
  // multiPickPresets — raw readline, works in all terminals
  // -------------------------------------------------------------------------
  async function multiPickPresets(items: MultiSelectChoice[]): Promise<string[]> {
    validateMultiSelectItems(items);

    // Non-interactive stdin (piped input, CI without TTY)
    if (!process.stdin.readable) {
      return [];
    }

    return new Promise<string[]>((resolve, reject) => {
      const selected = new Set<number>();
      let cursor = 0;
      let rendered = false;

      const cols = process.stdout.columns ?? 80;
      const maxDescWidth = Math.max(0, cols - 23);

      const render = (): void => {
        if (rendered) {
          process.stdout.write('\x1B[u');
        } else {
          process.stdout.write('\x1B[s');
        }
        rendered = true;
        process.stdout.write('\x1B[J');

        const heading = capability.color
          ? theme.heading('? Select presets to install:')
          : '? Select presets to install:';
        const hint = capability.color
          ? theme.muted(' (Space to select, <a> toggle all, Enter to confirm)')
          : ' (Space to select, <a> toggle all, Enter to confirm)';
        process.stdout.write(heading + hint + '\n');

        for (let i = 0; i < items.length; i++) {
          const marker = cursor === i
            ? (capability.color ? theme.command('>') : '>')
            : ' ';
          const check = selected.has(i)
            ? (capability.color ? '\x1B[32m[x]\x1B[0m' : '[x]')
            : '[ ]';
          const name = items[i].name.padEnd(12);
          const rawDesc = items[i].description;
          const desc = rawDesc.length > maxDescWidth
            ? rawDesc.slice(0, Math.max(0, maxDescWidth - 1)) + '\u2026'
            : rawDesc;
          const styledName = capability.color ? theme.command(name) : name;
          const styledDesc = capability.color ? theme.muted(desc) : desc;
          process.stdout.write(`  ${marker} ${check} ${styledName} - ${styledDesc}\n`);
        }
      };

      render();

      // Try raw mode — works in real TTY and most IDE terminals
      let rawModeActive = false;
      try {
        process.stdin.setRawMode(true);
        rawModeActive = true;
      } catch {
        // setRawMode not supported — fall back to line-mode input
      }

      process.stdin.resume();
      process.stdin.setEncoding('utf-8');

      let escBuffer = '';

      const cleanup = (): void => {
        if (rawModeActive) {
          try { process.stdin.setRawMode(false); } catch { /* ignore */ }
        }
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
      };

      const handleArrow = (seq: string): boolean => {
        if (seq === '\x1B[A' || seq === '\x1BOA') {
          cursor = (cursor - 1 + items.length) % items.length;
          render();
          return true;
        }
        if (seq === '\x1B[B' || seq === '\x1BOB') {
          cursor = (cursor + 1) % items.length;
          render();
          return true;
        }
        return false;
      };

      const onData = (key: string): void => {
        if (escBuffer.length > 0) {
          escBuffer += key;
          if (escBuffer.length >= 3) {
            const seq = escBuffer;
            escBuffer = '';
            handleArrow(seq);
          }
          return;
        }

        if (key.length >= 3 && key.startsWith('\x1B')) {
          handleArrow(key);
          return;
        }

        if (key === '\x1B') {
          escBuffer = key;
          setTimeout(() => { if (escBuffer.length > 0) escBuffer = ''; }, 50);
          return;
        }

        // Ctrl+C
        if (key === '\x03') {
          cleanup();
          reject(new Error('SIGINT'));
          return;
        }

        // Enter
        if (key === '\r' || key === '\n') {
          cleanup();
          resolve([...selected].map((i) => items[i].name));
          return;
        }

        // Space — toggle current
        if (key === ' ') {
          if (selected.has(cursor)) selected.delete(cursor);
          else selected.add(cursor);
          render();
          return;
        }

        // 'a' — toggle all
        if (key === 'a' || key === 'A') {
          if (selected.size === items.length) selected.clear();
          else for (let i = 0; i < items.length; i++) selected.add(i);
          render();
          return;
        }

        // vim keys
        if (key === 'k') { cursor = (cursor - 1 + items.length) % items.length; render(); return; }
        if (key === 'j') { cursor = (cursor + 1) % items.length; render(); return; }
      };

      process.stdin.on('data', onData);
    });
  }

  // -------------------------------------------------------------------------
  // confirm — readline-based Y/n
  // -------------------------------------------------------------------------
  async function confirm(message: string, defaultYes = true): Promise<boolean> {
    if (!process.stdin.readable) return defaultYes;

    return new Promise<boolean>((resolve, reject) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const hint = defaultYes ? '(Y/n)' : '(y/N)';
      const styled = capability.color ? theme.heading('? ') + message : `? ${message}`;
      rl.question(`${styled} ${hint} `, (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === '') resolve(defaultYes);
        else resolve(a === 'y' || a === 'yes');
      });
      rl.on('SIGINT', () => { rl.close(); reject(new Error('SIGINT')); });
    });
  }

  // -------------------------------------------------------------------------
  // selectTier — simple numbered list
  // -------------------------------------------------------------------------
  async function selectTier<T extends string>(
    title: string,
    options: Array<{ value: T; label: string; hint?: string }>,
    defaultIndex = 0,
  ): Promise<T> {
    if (!process.stdin.readable) {
      return options[Math.max(0, Math.min(defaultIndex, options.length - 1))].value;
    }

    return new Promise<T>((resolve, reject) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const styled = capability.color ? theme.heading(`? ${title}`) : `? ${title}`;
      process.stdout.write(styled + '\n');
      options.forEach((opt, i) => {
        const marker = i === defaultIndex ? '>' : ' ';
        const label = capability.color ? theme.command(opt.label) : opt.label;
        process.stdout.write(`  ${marker} ${i + 1}. ${label}${opt.hint ? ' - ' + opt.hint : ''}\n`);
      });
      rl.question(`Choice [${defaultIndex + 1}]: `, (answer) => {
        rl.close();
        const n = parseInt(answer.trim(), 10);
        const idx = isNaN(n) ? defaultIndex : Math.max(0, Math.min(n - 1, options.length - 1));
        resolve(options[idx].value);
      });
      rl.on('SIGINT', () => { rl.close(); reject(new Error('SIGINT')); });
    });
  }

  // -------------------------------------------------------------------------
  // conflictChoice
  // -------------------------------------------------------------------------
  async function conflictChoice(targetRel: string): Promise<ConflictChoice['value']> {
    if (!process.stdin.readable) return 'skip';

    return new Promise<ConflictChoice['value']>((resolve, reject) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const msg = capability.color
        ? `\n${theme.heading('?')} File ${theme.command(targetRel)} already exists.\n`
        : `\nFile ${targetRel} already exists.\n`;
      process.stdout.write(msg);
      process.stdout.write('  > overwrite       - Replace (backup saved)\n');
      process.stdout.write('    skip            - Keep existing\n');
      process.stdout.write('    view-diff       - Show diff\n');
      process.stdout.write('    overwrite-all   - Replace all remaining\n');
      rl.question('  Choice (overwrite/skip/diff/all) [skip]: ', (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === 'o' || a === 'overwrite') resolve('overwrite');
        else if (a === 'd' || a === 'diff') resolve('view-diff');
        else if (a === 'a' || a === 'all') resolve('overwrite-all');
        else resolve('skip');
      });
      rl.on('SIGINT', () => { rl.close(); reject(new Error('SIGINT')); });
    });
  }

  return { multiPickPresets, selectTier, confirm, conflictChoice };
}


import type { TerminalCapability } from './capability.js';
import type { ThemeTokens } from './theme.js';
import { loadPrompts, type PromptsFn } from './vendor.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface MultiSelectChoice {
  /** Unique identifier / value returned on selection */
  name: string;
  /** Human-readable label shown in the prompt */
  description: string;
  /** Pre-selected state */
  selected?: boolean;
  /** Hint shown alongside the choice */
  hint?: string;
}

export interface ConflictChoice {
  value: 'overwrite' | 'skip' | 'view-diff' | 'overwrite-all';
  label: string;
}

export interface ThemedPrompt {
  /**
   * Multi-select preset picker.
   * Validates items.length >= 1 and unique names.
   * Returns selected names, or [] when !isTTY.
   */
  multiPickPresets(items: MultiSelectChoice[]): Promise<string[]>;

  /**
   * Single-select from a list of options.
   * Returns the selected value, or options[defaultIndex].value when !isTTY.
   */
  selectTier<T extends string>(
    title: string,
    options: Array<{ value: T; label: string; hint?: string }>,
    defaultIndex?: number,
  ): Promise<T>;

  /**
   * Yes/No confirmation prompt.
   * Returns defaultYes when !isTTY.
   */
  confirm(message: string, defaultYes?: boolean): Promise<boolean>;

  /**
   * Conflict resolution choice for a specific file.
   * Returns 'skip' when !isTTY.
   */
  conflictChoice(targetRel: string): Promise<ConflictChoice['value']>;
}
