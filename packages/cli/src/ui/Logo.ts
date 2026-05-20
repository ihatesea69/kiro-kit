/**
 * Logo.ts — ASCII logo renderer for the welcome screen.
 *
 * Renders a large figlet logo with gradient when the terminal supports it,
 * gracefully degrading to compact single-line form for narrow or plain terminals.
 *
 * Never writes to stdout — callers receive a string and decide when/where to print.
 *
 * Render paths:
 *   unicode=true  && color=true  && columns>=60 → figlet + gradient
 *   color=false   (unicode=true  && columns>=60) → figlet plain (no ANSI)
 *   unicode=false || columns<60                  → compact "kiro-kit vX.Y.Z\nsubtitle"
 *   vendor figlet/gradient unavailable           → compact fallback
 */

import type { TerminalCapability } from './capability.js';
import type { ThemeTokens } from './theme.js';
import { loadFiglet, loadGradientString } from './vendor.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type LogoFont =
  | 'ANSI Shadow'
  | 'Big'
  | 'Slant'
  | '3D-ASCII'
  | 'Bloody';

export interface LogoOptions {
  /** Text to render as ASCII art. Default: 'kiro-kit' */
  text?: string;
  /** figlet font. Default: 'ANSI Shadow' */
  font?: LogoFont;
  /** Subtitle shown below the logo. */
  subtitle?: string;
  /** Version string (e.g. '0.3.1'). Shown as "vX.Y.Z" */
  version?: string;
}

export interface LogoRenderer {
  /** Render the logo according to capability. Returns a multi-line string. */
  render(opts: LogoOptions): string;
  /** Compact single-line fallback: "kiro-kit vX.Y.Z\nsubtitle" */
  renderCompact(opts: LogoOptions): string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a LogoRenderer bound to the given capability and theme.
 *
 * The renderer is synchronous — vendor modules must be pre-loaded before
 * calling render(). Use createLogoAsync() to pre-load and get a ready renderer.
 *
 * @param capability - Detected terminal capability
 * @param theme      - Theme tokens for styling
 * @param figlet     - Pre-loaded figlet module (or null for compact fallback)
 * @param gradient   - Pre-loaded gradient-string (or null for plain fallback)
 */
function createLogoSync(
  capability: TerminalCapability,
  theme: ThemeTokens,
  figlet: import('./vendor.js').FigletLike | null,
  gradient: import('./vendor.js').GradientStringLike | null,
): LogoRenderer {
  // -------------------------------------------------------------------------
  // Compact renderer (always available)
  // -------------------------------------------------------------------------
  function renderCompact(opts: LogoOptions): string {
    const text = opts.text ?? 'kiro-kit';
    const version = opts.version ?? '';
    const subtitle = opts.subtitle ?? '';

    let line = text;
    if (version) line += ` v${version}`;
    line = theme.heading(line);

    if (subtitle) {
      line += `\n${theme.muted(subtitle)}`;
    }
    return line;
  }

  // -------------------------------------------------------------------------
  // Full renderer
  // -------------------------------------------------------------------------
  function render(opts: LogoOptions): string {
    const text = opts.text ?? 'kiro-kit';
    const font = opts.font ?? 'ANSI Shadow';
    const subtitle = opts.subtitle ?? '';
    const version = opts.version ?? '';

    // Compact path: too narrow, unicode disabled, or vendor unavailable
    if (
      capability.columns < 60 ||
      !capability.unicode ||
      figlet === null
    ) {
      return renderCompact(opts);
    }

    // Generate figlet ASCII art
    let ascii: string;
    try {
      ascii = figlet.textSync(text, {
        font: font as Parameters<typeof figlet.textSync>[1] extends { font?: infer F } ? F : string,
        horizontalLayout: 'default',
      });
    } catch {
      // figlet failed (e.g. font not found) — fall back to compact
      return renderCompact(opts);
    }

    // Apply gradient or plain
    let body: string;
    if (capability.color && gradient !== null) {
      try {
        body = gradient(theme.logoGradient as unknown as string[])(ascii);
      } catch {
        // gradient failed — use plain
        body = ascii;
      }
    } else {
      // color=false: plain figlet, no ANSI bytes
      body = ascii;
    }

    // Append tagline
    if (subtitle || version) {
      let tagline = subtitle;
      if (version) {
        tagline += (subtitle ? '  ' : '') + `v${version}`;
      }
      body += `\n${theme.muted(tagline)}`;
    }

    return body;
  }

  return { render, renderCompact };
}

/**
 * Create a LogoRenderer, pre-loading vendor modules.
 *
 * @param capability - Detected terminal capability
 * @param theme      - Theme tokens for styling
 */
export async function createLogo(
  capability: TerminalCapability,
  theme: ThemeTokens,
): Promise<LogoRenderer> {
  // Only load vendors if we might need them
  const needsFull =
    capability.unicode && capability.columns >= 60;

  const [figlet, gradient] = await Promise.all([
    needsFull ? loadFiglet() : Promise.resolve(null),
    needsFull && capability.color ? loadGradientString() : Promise.resolve(null),
  ]);

  return createLogoSync(capability, theme, figlet, gradient);
}

/**
 * Synchronous factory for use when vendor modules are already loaded externally.
 * Prefer createLogo() (async) in normal usage.
 */
export { createLogoSync };
