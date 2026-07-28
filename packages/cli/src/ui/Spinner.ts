/**
 * Spinner.ts — Lightweight spinner wrapper for short-lived operations.
 *
 * Wraps ora when animate=true, falls back to plain prefix lines when
 * animate=false (non-TTY, CI, narrow terminal).
 *
 * Fallback output format:
 *   start(t)   → "-> {t}"
 *   succeed(t) → "[ok] {t}"
 *   fail(t)    → "[x] {t}"
 *   warn(t)    → "[!] {t}"
 *
 * Registers process.once('SIGINT') and process.once('exit') cleanup handlers
 * so the spinner never gets left "spinning" on unexpected exit.
 */

import type { TerminalCapability } from './capability.js';
import type { ThemeTokens } from './theme.js';
import { loadOra } from './vendor.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SpinnerHandle {
  /** Start the spinner with optional text. Returns self for chaining. */
  start(text?: string): SpinnerHandle;
  /** Update the spinner text while running. */
  setText(text: string): void;
  /** Stop with a success symbol and optional text. */
  succeed(text?: string): void;
  /** Stop with a failure symbol and optional text. */
  fail(text?: string): void;
  /** Stop with a warning symbol and optional text. */
  warn(text?: string): void;
  /** Stop the spinner without a symbol. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a SpinnerHandle bound to the given capability and theme.
 *
 * When animate=true, wraps ora for animated spinner output.
 * When animate=false, prints plain prefix lines to stdout.
 *
 * @param capability - Detected terminal capability
 * @param theme      - Theme tokens for styling (used for color in fallback)
 */
export async function createSpinner(
  capability: TerminalCapability,
  _theme: ThemeTokens,
): Promise<SpinnerHandle> {
  // -------------------------------------------------------------------------
  // Animated path: wrap ora
  // -------------------------------------------------------------------------
  if (capability.animate) {
    const ora = await loadOra();

    if (ora !== null) {
      const spinner = ora({ text: '', stream: process.stdout });
      let _running = false;

      function cleanup(): void {
        if (_running) {
          spinner.stop();
          _running = false;
        }
      }

      // Register cleanup on exit signals
      process.once('SIGINT', cleanup);
      process.once('exit', cleanup);

      const handle: SpinnerHandle = {
        start(text?: string): SpinnerHandle {
          spinner.text = text ?? '';
          spinner.start();
          _running = true;
          return handle;
        },
        setText(text: string): void {
          spinner.text = text;
        },
        succeed(text?: string): void {
          _running = false;
          spinner.succeed(text);
        },
        fail(text?: string): void {
          _running = false;
          spinner.fail(text);
        },
        warn(text?: string): void {
          _running = false;
          spinner.warn(text);
        },
        stop(): void {
          cleanup();
        },
      };

      return handle;
    }
    // ora unavailable — fall through to plain fallback
  }

  // -------------------------------------------------------------------------
  // Plain fallback: prefix lines to stdout
  // -------------------------------------------------------------------------
  let _currentText = '';
  let _running = false;

  function writeLine(prefix: string, text: string): void {
    process.stdout.write(`${prefix} ${text}\n`);
  }

  function cleanup(): void {
    _running = false;
  }

  process.once('SIGINT', cleanup);
  process.once('exit', cleanup);

  const handle: SpinnerHandle = {
    start(text?: string): SpinnerHandle {
      _currentText = text ?? '';
      _running = true;
      writeLine('->', _currentText);
      return handle;
    },
    setText(text: string): void {
      _currentText = text;
      // In plain mode, we don't re-print on setText — text is captured for
      // the next terminal call (succeed/fail/warn).
    },
    succeed(text?: string): void {
      _running = false;
      writeLine('[ok]', text ?? _currentText);
    },
    fail(text?: string): void {
      _running = false;
      writeLine('[x]', text ?? _currentText);
    },
    warn(text?: string): void {
      _running = false;
      writeLine('[!]', text ?? _currentText);
    },
    stop(): void {
      cleanup();
    },
  };

  return handle;
}
