/**
 * TaskRunner.ts — Task list renderer with listr2 and plain fallback.
 *
 * Displays a sequence of tasks with spinners, check marks, and failure symbols.
 * Delegates to listr2 when the terminal supports animation and color; falls back
 * to a simple sequential "-> task ... done" renderer otherwise.
 *
 * Renderer selection:
 *   animate=true && color=true && columns>=40 → listr2 'default' renderer
 *   animate=false || !isTTY || columns<40     → simple renderer (plain lines)
 *
 * TaskHelpers:
 *   setOutput(line) — stream sub-text under the running spinner
 *   setTitle(title) — mutate the task title in-place
 *
 * Error handling:
 *   When a task throws, the error is re-thrown with a `taskTitle` property
 *   attached so callers can identify which task failed. All started spinners
 *   are stopped before the rejection propagates.
 *
 * Throttle:
 *   listr2's default renderer already throttles at ~100ms. The simple renderer
 *   is synchronous per-task so throttling is not applicable.
 */

import type { TerminalCapability } from './capability.js';
import type { ThemeTokens } from './theme.js';
import { loadListr2 } from './vendor.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TaskDef<C = unknown> {
  /** Display title shown in the renderer */
  title: string;
  /** Optional hint shown under the spinner while running */
  hint?: string;
  /**
   * Optional skip predicate. Return true or a string reason to skip this task.
   * Skipped tasks are shown with a skip symbol and continue to the next task.
   */
  skip?: (ctx: C) => boolean | string | Promise<boolean | string>;
  /**
   * The task implementation. May throw to mark the task as failed.
   * Throwing aborts the remaining tasks and rejects the runner.
   */
  run: (ctx: C, helpers: TaskHelpers) => Promise<void>;
}

export interface TaskHelpers {
  /** Stream a sub-text line under the running spinner */
  setOutput(line: string): void;
  /** Mutate the task title (e.g. "Wrote 12 files") */
  setTitle(title: string): void;
}

export interface TaskRunner<C> {
  /** Execute all tasks sequentially. Resolves with the final context. */
  run(initialCtx: C): Promise<C>;
}

// ---------------------------------------------------------------------------
// Error with taskTitle attached
// ---------------------------------------------------------------------------

interface TaskError extends Error {
  taskTitle: string;
}

function attachTaskTitle(err: unknown, title: string): TaskError {
  const e = err instanceof Error ? err : new Error(String(err));
  (e as TaskError).taskTitle = title;
  return e as TaskError;
}

// ---------------------------------------------------------------------------
// Simple renderer (plain text, no animation)
// ---------------------------------------------------------------------------

function runSimple<C>(tasks: TaskDef<C>[], initialCtx: C): Promise<C> {
  return (async () => {
    const ctx = initialCtx;

    for (const task of tasks) {
      // Evaluate skip predicate
      if (task.skip) {
        let skipResult: boolean | string;
        try {
          skipResult = await task.skip(ctx);
        } catch {
          skipResult = false;
        }
        if (skipResult !== false) {
          const reason = typeof skipResult === 'string' ? ` (${skipResult})` : '';
          process.stdout.write(`-> ${task.title} [skipped${reason}]\n`);
          continue;
        }
      }

      process.stdout.write(`-> ${task.title} ...\n`);

      let currentTitle = task.title;

      const helpers: TaskHelpers = {
        setOutput(line: string): void {
          process.stdout.write(`   ${line}\n`);
        },
        setTitle(title: string): void {
          currentTitle = title;
        },
      };

      try {
        await task.run(ctx, helpers);
        process.stdout.write(`-> ${currentTitle} done\n`);
      } catch (err) {
        process.stdout.write(`-> ${currentTitle} FAILED\n`);
        throw attachTaskTitle(err, task.title);
      }
    }

    return ctx;
  })();
}

// ---------------------------------------------------------------------------
// Listr2 renderer (animated, colored)
// ---------------------------------------------------------------------------

async function runListr2<C>(
  tasks: TaskDef<C>[],
  initialCtx: C,
  ListrCtor: Awaited<ReturnType<typeof loadListr2>>,
): Promise<C> {
  if (ListrCtor === null) {
    // listr2 unavailable — fall back to simple
    return runSimple(tasks, initialCtx);
  }

  // Build listr2 task definitions
  const listrTasks = tasks.map((taskDef) => ({
    title: taskDef.title,
    skip: taskDef.skip
      ? (ctx: C) => taskDef.skip!(ctx)
      : undefined,
    task: async (ctx: C, wrapper: { output: string; title: string }) => {
      const helpers: TaskHelpers = {
        setOutput(line: string): void {
          wrapper.output = line;
        },
        setTitle(title: string): void {
          wrapper.title = title;
        },
      };

      try {
        await taskDef.run(ctx, helpers);
      } catch (err) {
        throw attachTaskTitle(err, taskDef.title);
      }
    },
  }));

  const listr = new ListrCtor(listrTasks, {
    ctx: initialCtx,
    concurrent: false,
    exitOnError: true,
    renderer: 'default',
    fallbackRenderer: 'simple',
    rendererOptions: {
      // Throttle re-render to >= 100ms (listr2 default is ~100ms already)
      lazy: false,
      collapseSubtasks: false,
      collapseSkips: false,
    },
  });

  return listr.run(initialCtx);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a TaskRunner bound to the given capability and theme.
 *
 * @param tasks      - Ordered list of task definitions
 * @param capability - Detected terminal capability
 * @param theme      - Theme tokens for styling
 */
export async function createTaskRunner<C>(
  tasks: TaskDef<C>[],
  capability: TerminalCapability,
  _theme: ThemeTokens,
): Promise<TaskRunner<C>> {
  // Determine renderer mode
  const useListr2 =
    capability.animate &&
    capability.color &&
    capability.columns >= 40;

  // Pre-load listr2 only when needed
  const ListrCtor = useListr2 ? await loadListr2() : null;

  return {
    async run(initialCtx: C): Promise<C> {
      if (useListr2 && ListrCtor !== null) {
        return runListr2(tasks, initialCtx, ListrCtor);
      }
      return runSimple(tasks, initialCtx);
    },
  };
}
