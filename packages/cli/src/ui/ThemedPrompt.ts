/**
 * ThemedPrompt.ts — Interactive prompt wrapper with theme support.
 *
 * Wraps the `prompts` library with theme primitives for consistent styling.
 * Provides multi-select, single-select, confirm, and conflict-choice prompts.
 *
 * Non-TTY semantics (non-blocking):
 *   multiPickPresets → []
 *   confirm          → defaultYes value
 *   selectTier       → options[defaultIndex].value
 *   conflictChoice   → 'skip'
 *
 * SIGINT handling:
 *   When the user presses Ctrl+C inside a prompt, raw mode is cleaned up
 *   and a new Error('SIGINT') is rejected so callers can exit with code 130.
 *
 * Color=false + isTTY:
 *   Still interactive — prompts library is used but theme methods strip color.
 */

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
      throw new Error(
        `multiPickPresets: duplicate item name "${item.name}" — all names must be unique`,
      );
    }
    seen.add(item.name);
  }
}

// ---------------------------------------------------------------------------
// SIGINT helper
// ---------------------------------------------------------------------------

/**
 * Wrap a prompts call so that a cancelled prompt (value === undefined)
 * or an aborted prompt rejects with Error('SIGINT').
 *
 * The `prompts` library sets the answer to undefined when the user presses
 * Ctrl+C (when onCancel is not overridden). We detect this and throw.
 */
function makeSigintHandler(reject: (err: Error) => void): () => void {
  return () => {
    // Attempt to restore terminal raw mode
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    } catch {
      // ignore — stdin may not support setRawMode
    }
    reject(new Error('SIGINT'));
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ThemedPrompt bound to the given capability and theme.
 *
 * @param capability - Detected terminal capability
 * @param theme      - Theme tokens for styling
 */
export async function createPrompt(
  capability: TerminalCapability,
  theme: ThemeTokens,
): Promise<ThemedPrompt> {
  // Pre-load prompts library
  const promptsFnOrNull: PromptsFn | null = capability.isTTY ? await loadPrompts() : null;

  // -------------------------------------------------------------------------
  // Non-TTY path: return defaults immediately without blocking
  // -------------------------------------------------------------------------
  if (!capability.isTTY || promptsFnOrNull === null) {
    return {
      async multiPickPresets(_items: MultiSelectChoice[]): Promise<string[]> {
        return [];
      },
      async selectTier<T extends string>(
        _title: string,
        options: Array<{ value: T; label: string; hint?: string }>,
        defaultIndex = 0,
      ): Promise<T> {
        return options[Math.max(0, Math.min(defaultIndex, options.length - 1))].value;
      },
      async confirm(_message: string, defaultYes = true): Promise<boolean> {
        return defaultYes;
      },
      async conflictChoice(_targetRel: string): Promise<ConflictChoice['value']> {
        return 'skip';
      },
    };
  }

  // -------------------------------------------------------------------------
  // TTY path: wrap prompts library
  // -------------------------------------------------------------------------

  // At this point we know promptsFnOrNull is non-null (checked above)
  const promptsFn: PromptsFn = promptsFnOrNull;

  /**
   * Run a prompts question and handle SIGINT (Ctrl+C → reject Error('SIGINT')).
   */
  async function runPrompt<T>(
    question: Parameters<PromptsFn>[0],
    resultKey: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const sigintHandler = makeSigintHandler(reject);

      // prompts calls onCancel when user presses Ctrl+C
      const options = {
        onCancel: () => {
          process.removeListener('SIGINT', sigintHandler);
          sigintHandler();
        },
      };

      process.once('SIGINT', sigintHandler);

      promptsFn(question as Parameters<PromptsFn>[0], options)
        .then((answers) => {
          process.removeListener('SIGINT', sigintHandler);
          const value = (answers as Record<string, unknown>)[resultKey];
          if (value === undefined) {
            // User cancelled without triggering onCancel (edge case)
            sigintHandler();
          } else {
            resolve(value as T);
          }
        })
        .catch((err: unknown) => {
          process.removeListener('SIGINT', sigintHandler);
          reject(err);
        });
    });
  }

  // -------------------------------------------------------------------------
  // multiPickPresets
  // -------------------------------------------------------------------------
  async function multiPickPresets(items: MultiSelectChoice[]): Promise<string[]> {
    validateMultiSelectItems(items);

    const choices = items.map((item) => ({
      title: theme.command(item.description),
      value: item.name,
      selected: item.selected ?? false,
      description: item.hint,
    }));

    return runPrompt<string[]>(
      {
        type: 'multiselect',
        name: 'selected',
        message: theme.heading('Select presets to install'),
        choices,
        hint: '- Space to select, Enter to confirm',
        instructions: false,
      },
      'selected',
    );
  }

  // -------------------------------------------------------------------------
  // selectTier
  // -------------------------------------------------------------------------
  async function selectTier<T extends string>(
    title: string,
    options: Array<{ value: T; label: string; hint?: string }>,
    defaultIndex = 0,
  ): Promise<T> {
    const choices = options.map((opt) => ({
      title: theme.command(opt.label),
      value: opt.value,
      description: opt.hint ? theme.muted(opt.hint) : undefined,
    }));

    return runPrompt<T>(
      {
        type: 'select',
        name: 'value',
        message: theme.heading(title),
        choices,
        initial: Math.max(0, Math.min(defaultIndex, options.length - 1)),
      },
      'value',
    );
  }

  // -------------------------------------------------------------------------
  // confirm
  // -------------------------------------------------------------------------
  async function confirm(message: string, defaultYes = true): Promise<boolean> {
    return runPrompt<boolean>(
      {
        type: 'confirm',
        name: 'value',
        message: theme.heading(message),
        initial: defaultYes,
      },
      'value',
    );
  }

  // -------------------------------------------------------------------------
  // conflictChoice
  // -------------------------------------------------------------------------
  async function conflictChoice(
    targetRel: string,
  ): Promise<ConflictChoice['value']> {
    const choices: Array<{ title: string; value: ConflictChoice['value'] }> = [
      { title: theme.command('overwrite'), value: 'overwrite' },
      { title: theme.muted('skip'), value: 'skip' },
      { title: theme.flag('view-diff'), value: 'view-diff' },
      { title: theme.danger('overwrite-all'), value: 'overwrite-all' },
    ];

    return runPrompt<ConflictChoice['value']>(
      {
        type: 'select',
        name: 'value',
        message: theme.heading(`Conflict: ${targetRel}`),
        choices,
        initial: 1, // default to 'skip'
      },
      'value',
    );
  }

  return {
    multiPickPresets,
    selectTier,
    confirm,
    conflictChoice,
  };
}
