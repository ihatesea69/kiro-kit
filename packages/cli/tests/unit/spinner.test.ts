/**
 * Unit tests for src/ui/Spinner.ts
 *
 * Tests cover:
 *   - animate=false: start() prints "-> {text}", succeed() prints "[ok] {text}",
 *     fail() prints "[x] {text}", warn() prints "[!] {text}"
 *   - setText() after start() updates the text used by succeed/fail/warn
 *   - stop() is a no-op in plain mode (no crash)
 *   - animate=false with ora unavailable: same plain behaviour
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSpinner } from '../../src/ui/Spinner.js';
import type { TerminalCapability } from '../../src/ui/capability.js';
import type { ThemeTokens } from '../../src/ui/theme.js';
import { _resetVendorCache } from '../../src/ui/vendor.js';

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

/** Minimal theme stub — identity functions */
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
// Tests
// ---------------------------------------------------------------------------

describe('Spinner (animate=false plain fallback)', () => {
  beforeEach(() => {
    _resetVendorCache();
  });

  afterEach(() => {
    _resetVendorCache();
  });

  it('start() prints "-> {text}" prefix', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('loading presets');
    });

    expect(output).toContain('-> loading presets');
  });

  it('succeed() prints "[ok] {text}" prefix', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('loading');
      spinner.succeed('done loading');
    });

    expect(output).toContain('[ok] done loading');
  });

  it('fail() prints "[x] {text}" prefix', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('loading');
      spinner.fail('load failed');
    });

    expect(output).toContain('[x] load failed');
  });

  it('warn() prints "[!] {text}" prefix', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('loading');
      spinner.warn('partial result');
    });

    expect(output).toContain('[!] partial result');
  });

  it('setText() after start() updates text used by succeed()', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('initial text');
      spinner.setText('updated text');
      spinner.succeed(); // no explicit text → uses _currentText
    });

    expect(output).toContain('[ok] updated text');
  });

  it('setText() after start() updates text used by fail()', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('task');
      spinner.setText('task (step 2)');
      spinner.fail();
    });

    expect(output).toContain('[x] task (step 2)');
  });

  it('stop() does not throw and produces no extra output', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('task');
      spinner.stop();
    });

    // stop() in plain mode is a no-op — only the start line should appear
    expect(output).toContain('-> task');
    expect(output).not.toContain('[ok]');
    expect(output).not.toContain('[x]');
  });

  it('start() returns the handle for chaining', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    await captureStdout(async () => {
      const result = spinner.start('chaining test');
      expect(result).toBe(spinner);
    });
  });

  it('succeed() with explicit text overrides current text', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('original');
      spinner.succeed('explicit success message');
    });

    expect(output).toContain('[ok] explicit success message');
    expect(output).not.toContain('[ok] original');
  });

  it('fail() with explicit text overrides current text', async () => {
    const cap = makeCap({ animate: false });
    const spinner = await createSpinner(cap, makeTheme());

    const output = await captureStdout(async () => {
      spinner.start('original');
      spinner.fail('explicit failure message');
    });

    expect(output).toContain('[x] explicit failure message');
  });
});
