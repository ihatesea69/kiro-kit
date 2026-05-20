/**
 * Logo.ts — ASCII logo renderer for the welcome screen.
 *
 * Uses figlet with "Slant" font (fits in ~80 cols) + gradient coloring.
 * Falls back to compact single-line form for narrow or plain terminals.
 */

import type { TerminalCapability } from './capability.js';
import type { ThemeTokens } from './theme.js';
import { loadFiglet, loadGradientString } from './vendor.js';

export type LogoFont = 'ANSI Shadow' | 'Big' | 'Slant' | '3D-ASCII' | 'Bloody';

export interface LogoOptions {
  text?: string;
  font?: LogoFont;
  subtitle?: string;
  version?: string;
}

export interface LogoRenderer {
  render(opts: LogoOptions): string;
  renderCompact(opts: LogoOptions): string;
}

function createLogoSync(
  capability: TerminalCapability,
  theme: ThemeTokens,
  figlet: import('./vendor.js').FigletLike | null,
  gradient: import('./vendor.js').GradientStringLike | null,
): LogoRenderer {
  function renderCompact(opts: LogoOptions): string {
    const text = opts.text ?? 'kiro-kit';
    const version = opts.version ?? '';
    const subtitle = opts.subtitle ?? '';
    let line = text;
    if (version) line += ` v${version}`;
    line = theme.heading(line);
    if (subtitle) line += `\n${theme.muted(subtitle)}`;
    return line;
  }

  function render(opts: LogoOptions): string {
    const font = opts.font ?? 'Slant';
    const subtitle = opts.subtitle ?? '';
    const version = opts.version ?? '';
    const text = opts.text ?? 'kiro-kit';

    if (capability.columns < 60 || !capability.unicode || figlet === null) {
      return renderCompact(opts);
    }

    let ascii: string;
    try {
      ascii = figlet.textSync(text, {
        font: font as Parameters<typeof figlet.textSync>[1] extends { font?: infer F } ? F : string,
        horizontalLayout: 'default',
      });
    } catch {
      return renderCompact(opts);
    }

    let body: string;
    if (capability.color && gradient !== null) {
      try {
        body = gradient(theme.logoGradient as unknown as string[])(ascii);
      } catch {
        body = ascii;
      }
    } else {
      body = ascii;
    }

    if (subtitle || version) {
      let tagline = subtitle;
      if (version) tagline += (subtitle ? '  ' : '') + `v${version}`;
      body += `\n${theme.muted(tagline)}`;
    }

    return body;
  }

  return { render, renderCompact };
}

export async function createLogo(
  capability: TerminalCapability,
  theme: ThemeTokens,
): Promise<LogoRenderer> {
  const needsFull = capability.unicode && capability.columns >= 60;
  const [figlet, gradient] = await Promise.all([
    needsFull ? loadFiglet() : Promise.resolve(null),
    needsFull && capability.color ? loadGradientString() : Promise.resolve(null),
  ]);
  return createLogoSync(capability, theme, figlet, gradient);
}

export { createLogoSync };
