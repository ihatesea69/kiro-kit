/**
 * theme.ts — Palette, semantic tokens, and color helper factory.
 *
 * Separates color values from components. All styling goes through
 * ThemeTokens methods so that color=false produces clean plain text.
 *
 * Usage:
 *   const theme = await createTheme(capability);
 *   console.log(theme.heading('Hello'));
 */

import type { TerminalCapability } from './capability.js';
import {
  loadChalk,
  loadTerminalLink,
  type ChalkLike,
  type TerminalLinkFn,
} from './vendor.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ThemePalette {
  primary: string;    // #a970ff
  secondary: string;  // #8bd5ff
  muted: string;      // #6f6a7c
  text: string;       // #f4f1ff
  danger: string;     // #ff5c8a
  success: string;    // #22c55e
  warn: string;       // #f5b042
}

export interface ThemeTokens {
  /** Gradient stops for logo (primary → secondary) */
  readonly logoGradient: readonly [string, string, ...string[]];
  /** Style primitives — each returns a styled string */
  heading: (s: string) => string;
  command: (s: string) => string;
  flag: (s: string) => string;
  pathStyle: (s: string) => string;
  success: (s: string) => string;
  danger: (s: string) => string;
  muted: (s: string) => string;
  /**
   * Render a hyperlink.
   * Validates that url starts with https:// or mailto:.
   * Uses OSC-8 terminal-link when capability.hyperlink=true,
   * otherwise falls back to "label (url)".
   */
  link: (label: string, url: string) => string;
}

// ---------------------------------------------------------------------------
// Default palette
// ---------------------------------------------------------------------------

export const DEFAULT_PALETTE: ThemePalette = {
  primary: '#c084fc',    // violet-400 — bright purple
  secondary: '#818cf8',  // indigo-400 — purple-blue
  muted: '#7c6f9f',      // muted purple-gray
  text: '#f5f3ff',       // near-white with purple tint
  danger: '#f472b6',     // pink-400
  success: '#34d399',    // emerald-400
  warn: '#fbbf24',       // amber-400
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

function validatePalette(palette: ThemePalette): void {
  for (const [field, value] of Object.entries(palette) as [keyof ThemePalette, string][]) {
    if (!HEX_REGEX.test(value)) {
      throw new Error(
        `ThemePalette.${field} is not a valid hex color: "${value}". Expected format: #rrggbb`,
      );
    }
  }
  if (palette.primary === palette.secondary) {
    throw new Error(
      `ThemePalette.primary and ThemePalette.secondary must be different colors (gradient requires distinct stops).`,
    );
  }
}

const VALID_URL_SCHEMES = ['https://', 'mailto:'];

function validateUrl(url: string): void {
  const valid = VALID_URL_SCHEMES.some((scheme) => url.startsWith(scheme));
  if (!valid) {
    throw new Error(
      `link() URL must start with https:// or mailto:, got: "${url}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// ANSI 256 color approximation helper
// ---------------------------------------------------------------------------

/**
 * Convert a hex color string to the nearest xterm-256 color index.
 * Uses the 6x6x6 color cube (indices 16–231).
 */
function hexToAnsi256(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Map each channel to 0-5 range
  const ri = Math.round((r / 255) * 5);
  const gi = Math.round((g / 255) * 5);
  const bi = Math.round((b / 255) * 5);
  return 16 + 36 * ri + 6 * gi + bi;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create theme tokens for the given capability.
 *
 * This is an async factory because it pre-loads terminal-link for the
 * sync link() helper. If terminal-link is unavailable, link() falls back
 * to "label (url)" format.
 *
 * @param capability - Detected terminal capability
 * @param palette    - Optional partial palette override (merged with defaults)
 */
export async function createTheme(
  capability: TerminalCapability,
  palette?: Partial<ThemePalette>,
): Promise<ThemeTokens> {
  // Merge palette with defaults
  const merged: ThemePalette = { ...DEFAULT_PALETTE, ...palette };
  validatePalette(merged);

  // Pre-load terminal-link so link() can be sync
  let terminalLinkFn: TerminalLinkFn | null = null;
  if (capability.hyperlink) {
    terminalLinkFn = await loadTerminalLink();
  }

  // -------------------------------------------------------------------------
  // No-color path: identity functions
  // -------------------------------------------------------------------------
  if (!capability.color) {
    const identity = (s: string): string => s;
    const linkFn = (label: string, url: string): string => {
      validateUrl(url);
      return `${label} (${url})`;
    };

    return {
      logoGradient: [merged.primary, merged.secondary],
      heading: identity,
      command: identity,
      flag: identity,
      pathStyle: identity,
      success: identity,
      danger: identity,
      muted: identity,
      link: linkFn,
    };
  }

  // -------------------------------------------------------------------------
  // Color path: load chalk
  // -------------------------------------------------------------------------
  const chalk: ChalkLike | null = await loadChalk();

  // Helper: apply hex color via chalk (truecolor) or ansi256 fallback
  function applyColor(hex: string): (s: string) => string {
    if (!chalk) {
      // chalk unavailable — return identity
      return (s: string) => s;
    }
    if (capability.truecolor) {
      return (s: string) => chalk.hex(hex)(s);
    }
    // ANSI 256 approximation
    const idx = hexToAnsi256(hex);
    return (s: string) => chalk.ansi256(idx)(s);
  }

  const primaryFn = applyColor(merged.primary);
  const secondaryFn = applyColor(merged.secondary);
  const mutedFn = applyColor(merged.muted);
  const successFn = applyColor(merged.success);
  const dangerFn = applyColor(merged.danger);

  const headingFn = (s: string): string =>
    chalk ? chalk.bold(primaryFn(s)) : primaryFn(s);

  const commandFn = (s: string): string =>
    chalk ? chalk.bold(secondaryFn(s)) : secondaryFn(s);

  const flagFn = (s: string): string => mutedFn(s);

  const pathStyleFn = (s: string): string =>
    chalk ? chalk.underline(secondaryFn(s)) : secondaryFn(s);

  const linkFn = (label: string, url: string): string => {
    validateUrl(url);
    if (capability.hyperlink && terminalLinkFn) {
      return terminalLinkFn(label, url);
    }
    return `${label} (${url})`;
  };

  return {
    logoGradient: [merged.primary, '#a78bfa', merged.secondary, '#f472b6'],
    heading: headingFn,
    command: commandFn,
    flag: flagFn,
    pathStyle: pathStyleFn,
    success: successFn,
    danger: dangerFn,
    muted: mutedFn,
    link: linkFn,
  };
}
