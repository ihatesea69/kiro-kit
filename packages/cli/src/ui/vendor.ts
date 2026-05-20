/**
 * Lazy import adapter for ESM-only vendor packages.
 *
 * Each loadX() function uses dynamic import() with try/catch so that:
 *   - The promise is cached after the first resolve (no re-importing).
 *   - null is returned when a load fails; callers must handle the null fallback.
 *
 * This keeps postinstall and lightweight commands (list, --version) free of
 * the cold-start cost of loading figlet, boxen, ora, listr2, etc.
 */

// ---------------------------------------------------------------------------
// Types — use the default export shape for packages whose @types ship CJS-style
// ---------------------------------------------------------------------------

import type { ChalkInstance } from 'chalk';
import type * as FigletNS from 'figlet';
import type * as GradientNS from 'gradient-string';
import type { Options as BoxenOptions } from 'boxen';
import type { Ora, Options as OraOptions } from 'ora';
import type { Listr, ListrTask, ListrOptions } from 'listr2';
import type { PromptObject, Answers, Options as PromptsOptions } from 'prompts';
import type terminalLinkDefault from 'terminal-link';

// Re-export convenience types for callers
export type { ChalkInstance, BoxenOptions, OraOptions, Ora, Listr, ListrTask, ListrOptions, PromptObject, Answers, PromptsOptions };

/** The callable chalk instance (default export of chalk@5) */
export type ChalkLike = ChalkInstance;

/** figlet namespace (text, textSync, etc.) */
export type FigletLike = typeof FigletNS;

/** gradient-string default export (callable function + named gradients) */
export type GradientStringLike = typeof GradientNS.default;

/** boxen default export (callable function) */
export type BoxenFn = (text: string, options?: BoxenOptions) => string;

/** ora default export (callable factory) */
export type OraFn = (options?: string | OraOptions) => Ora;

/** Listr constructor */
export type ListrCtor = typeof Listr;

/** prompts default export (callable function) */
export type PromptsFn = <T extends string = string>(
  questions: PromptObject<T> | PromptObject<T>[],
  options?: PromptsOptions,
) => Promise<Answers<T>>;

/** terminal-link default export */
export type TerminalLinkFn = typeof terminalLinkDefault;

// ---------------------------------------------------------------------------
// Cache slots — typed as Promise<T | null> | undefined (undefined = not yet started)
// ---------------------------------------------------------------------------

let _chalk: Promise<ChalkLike | null> | undefined;
let _figlet: Promise<FigletLike | null> | undefined;
let _gradientString: Promise<GradientStringLike | null> | undefined;
let _boxen: Promise<BoxenFn | null> | undefined;
let _ora: Promise<OraFn | null> | undefined;
let _listr2: Promise<ListrCtor | null> | undefined;
let _prompts: Promise<PromptsFn | null> | undefined;
let _terminalLink: Promise<TerminalLinkFn | null> | undefined;

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/** Load chalk. Returns the default ChalkInstance, or null if unavailable. */
export function loadChalk(): Promise<ChalkLike | null> {
  if (_chalk === undefined) {
    _chalk = import('chalk')
      .then((m) => m.default as ChalkLike)
      .catch(() => null);
  }
  return _chalk;
}

/** Load figlet. Returns the figlet namespace, or null if unavailable. */
export function loadFiglet(): Promise<FigletLike | null> {
  if (_figlet === undefined) {
    _figlet = import('figlet')
      .then((m) => m as unknown as FigletLike)
      .catch(() => null);
  }
  return _figlet;
}

/** Load gradient-string. Returns the default callable, or null if unavailable. */
export function loadGradientString(): Promise<GradientStringLike | null> {
  if (_gradientString === undefined) {
    _gradientString = import('gradient-string')
      .then((m) => m.default as GradientStringLike)
      .catch(() => null);
  }
  return _gradientString;
}

/** Load boxen. Returns the default callable, or null if unavailable. */
export function loadBoxen(): Promise<BoxenFn | null> {
  if (_boxen === undefined) {
    _boxen = import('boxen')
      .then((m) => m.default as BoxenFn)
      .catch(() => null);
  }
  return _boxen;
}

/** Load ora. Returns the default factory, or null if unavailable. */
export function loadOra(): Promise<OraFn | null> {
  if (_ora === undefined) {
    _ora = import('ora')
      .then((m) => m.default as OraFn)
      .catch(() => null);
  }
  return _ora;
}

/** Load listr2. Returns the Listr constructor, or null if unavailable. */
export function loadListr2(): Promise<ListrCtor | null> {
  if (_listr2 === undefined) {
    _listr2 = import('listr2')
      .then((m) => m.Listr as ListrCtor)
      .catch(() => null);
  }
  return _listr2;
}

/** Load prompts. Returns the default callable, or null if unavailable. */
export function loadPrompts(): Promise<PromptsFn | null> {
  if (_prompts === undefined) {
    _prompts = import('prompts')
      .then((m) => m.default as unknown as PromptsFn)
      .catch(() => null);
  }
  return _prompts;
}

/** Load terminal-link. Returns the default callable, or null if unavailable. */
export function loadTerminalLink(): Promise<TerminalLinkFn | null> {
  if (_terminalLink === undefined) {
    _terminalLink = import('terminal-link')
      .then((m) => m.default as TerminalLinkFn)
      .catch(() => null);
  }
  return _terminalLink;
}

// ---------------------------------------------------------------------------
// Reset helpers (test-only — allow injecting failures)
// ---------------------------------------------------------------------------

/** @internal Reset all cached promises. Used in tests to simulate load failures. */
export function _resetVendorCache(): void {
  _chalk = undefined;
  _figlet = undefined;
  _gradientString = undefined;
  _boxen = undefined;
  _ora = undefined;
  _listr2 = undefined;
  _prompts = undefined;
  _terminalLink = undefined;
}
