/**
 * Unit tests for src/ui/TaskRunner.ts
 *
 * Tests cover:
 *   - animate=false: simple renderer prints "-> task ..." and "-> task done"
 *   - task.skip returning true: task is skipped, next task runs
 *   - task.skip returning a string reason: skip message included in output
 *   - task throw: rejects with error that has taskTitle attached
 *   - TaskHelpers.setOutput: prints sub-text under the task
 *   - TaskHelpers.setTitle: mutates title used in "done" line
 *   - columns<40: forces simple renderer even if animate=true
 */

import { describe, it, expect } from 'vitest';
import { createTaskRunner } from '../../src/ui/TaskRunner.js';
import type { TaskDef } from '../../src/ui/TaskRunner.js';
import type { TerminalCapability } from '../../src/ui/capability.js';
import type { ThemeTokens } from '../../src/ui/theme.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCap(overrides: Partial<TerminalCapability> = {}): TerminalCapability {
  return Object.freeze({
    isTTY: false,
    color: false,
    truecolor: false,
    unicode: true,
    hyperlink: false,
    animate: false,
    columns: 80,
    ...overrides,
  });
}

function makeTheme(): ThemeTokens {
  const id = (s: string) => s;
  return {
    logoGradient: ['#a970ff', '#8bd5ff'],
    heading: id,
    command: id,
    flag: id,
    pathStyle: id,
    success: id,
    danger: id,
    muted: id,
    link: (label, url) => `${label} (${url})`,
  };
}

interface TestCtx {
  filesWritten: number;
  log: string[];
}

function makeCtx(): TestCtx {
  return { filesWritten: 0, log: [] };
}

/** Capture stdout writes during a callback */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown, ...args: unknown[]) => {
    chunks.push(String(chunk));
    return original(chunk as Parameters<typeof original>[0], ...(args as Parameters<typeof original>[1][]));
  };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

// ---------------------------------------------------------------------------
// Simple renderer (animate=false)
// ---------------------------------------------------------------------------

describe('TaskRunner simple renderer (animate=false)', () => {
  it('prints "-> task ..." before running and "-> task done" after', async () => {
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Load presets',
        run: async (ctx) => {
          ctx.filesWritten += 1;
        },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    const output = await captureStdout(async () => {
      await runner.run(makeCtx());
    });

    expect(output).toContain('-> Load presets ...');
    expect(output).toContain('-> Load presets done');
  });

  it('runs multiple tasks in sequence', async () => {
    const order: string[] = [];
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Task A',
        run: async () => { order.push('A'); },
      },
      {
        title: 'Task B',
        run: async () => { order.push('B'); },
      },
      {
        title: 'Task C',
        run: async () => { order.push('C'); },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    await captureStdout(async () => {
      await runner.run(makeCtx());
    });

    expect(order).toEqual(['A', 'B', 'C']);
  });

  it('resolves with the final context', async () => {
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Write files',
        run: async (ctx) => {
          ctx.filesWritten = 42;
        },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    let result!: TestCtx;
    await captureStdout(async () => {
      result = await runner.run(makeCtx());
    });

    expect(result.filesWritten).toBe(42);
  });

  it('task.skip returning true skips the task and continues', async () => {
    const ran: string[] = [];
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Skipped task',
        skip: () => true,
        run: async () => { ran.push('skipped'); },
      },
      {
        title: 'Normal task',
        run: async () => { ran.push('normal'); },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    const output = await captureStdout(async () => {
      await runner.run(makeCtx());
    });

    expect(ran).toEqual(['normal']); // skipped task did not run
    expect(output).toContain('[skipped]');
    expect(output).toContain('-> Normal task done');
  });

  it('task.skip returning a string reason includes reason in output', async () => {
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Powers setup',
        skip: () => 'powers disabled',
        run: async () => { /* never runs */ },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    const output = await captureStdout(async () => {
      await runner.run(makeCtx());
    });

    expect(output).toContain('powers disabled');
    expect(output).toContain('[skipped');
  });

  it('task throw rejects with error that has taskTitle attached', async () => {
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Failing task',
        run: async () => {
          throw new Error('EACCES: permission denied');
        },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());

    let caughtError: unknown;
    await captureStdout(async () => {
      try {
        await runner.run(makeCtx());
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toContain('EACCES');
    expect((caughtError as { taskTitle: string }).taskTitle).toBe('Failing task');
  });

  it('task throw stops subsequent tasks from running', async () => {
    const ran: string[] = [];
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Task A',
        run: async () => { ran.push('A'); },
      },
      {
        title: 'Task B (fails)',
        run: async () => {
          ran.push('B');
          throw new Error('B failed');
        },
      },
      {
        title: 'Task C',
        run: async () => { ran.push('C'); },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    await captureStdout(async () => {
      try {
        await runner.run(makeCtx());
      } catch {
        // expected
      }
    });

    expect(ran).toEqual(['A', 'B']); // C never ran
  });

  it('TaskHelpers.setOutput prints sub-text under the task', async () => {
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Writing files',
        run: async (_ctx, helpers) => {
          helpers.setOutput('3 preset(s) selected');
        },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    const output = await captureStdout(async () => {
      await runner.run(makeCtx());
    });

    expect(output).toContain('3 preset(s) selected');
  });

  it('TaskHelpers.setTitle mutates the title used in the "done" line', async () => {
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Writing workspace files',
        run: async (_ctx, helpers) => {
          helpers.setTitle('Wrote 12 files (3 skipped)');
        },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    const output = await captureStdout(async () => {
      await runner.run(makeCtx());
    });

    expect(output).toContain('-> Wrote 12 files (3 skipped) done');
  });
});

// ---------------------------------------------------------------------------
// Narrow terminal forces simple renderer
// ---------------------------------------------------------------------------

describe('TaskRunner narrow terminal (columns<40)', () => {
  it('uses simple renderer when columns<40 even if animate=true', async () => {
    // animate=true but columns=30 → should fall back to simple
    const cap = makeCap({ animate: true, color: true, isTTY: true, columns: 30 });

    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Narrow task',
        run: async () => { /* no-op */ },
      },
    ];

    const runner = await createTaskRunner(tasks, cap, makeTheme());
    const output = await captureStdout(async () => {
      await runner.run(makeCtx());
    });

    // Simple renderer output pattern
    expect(output).toContain('-> Narrow task');
  });
});

// ---------------------------------------------------------------------------
// Context mutation
// ---------------------------------------------------------------------------

describe('TaskRunner context mutation', () => {
  it('context mutations from earlier tasks are visible to later tasks', async () => {
    const tasks: TaskDef<TestCtx>[] = [
      {
        title: 'Task 1',
        run: async (ctx) => {
          ctx.filesWritten = 5;
        },
      },
      {
        title: 'Task 2',
        run: async (ctx) => {
          ctx.filesWritten += 3;
        },
      },
    ];

    const runner = await createTaskRunner(tasks, makeCap({ animate: false }), makeTheme());
    let result!: TestCtx;
    await captureStdout(async () => {
      result = await runner.run(makeCtx());
    });

    expect(result.filesWritten).toBe(8);
  });
});
