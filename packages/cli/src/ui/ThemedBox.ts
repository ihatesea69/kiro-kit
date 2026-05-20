/**
 * ThemedBox.ts — Bordered box renderer with variant support.
 *
 * Wraps boxen when available, falls back to a hand-drawn ASCII box.
 * Supports info/tip/success/warn/error variants mapped to theme colors.
 *
 * Border styles:
 *   unicode=true  → 'round' (╭─╮ style)
 *   unicode=false → 'classic' (+/-/| style)
 *
 * Width defaults to min(capability.columns - 4, 80).
 * When columns < 40, padding is forced to 0.
 */

import type { TerminalCapability } from './capability.js';
import type { ThemeTokens } from './theme.js';
import { loadBoxen, loadChalk } from './vendor.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type BoxVariant = 'info' | 'tip' | 'success' | 'warn' | 'error';

export interface ThemedBoxOptions {
  /** Title shown on the top border */
  title?: string;
  /** Visual variant controlling border color. Default: 'info' */
  variant?: BoxVariant;
  /** Inner padding (spaces). Default: 1. Forced to 0 when columns < 40. */
  padding?: number;
  /** Box width. Default: min(capability.columns - 4, 80) */
  width?: number;
}

export interface ThemedBoxRenderer {
  render(content: string, opts?: ThemedBoxOptions): string;
}

// ---------------------------------------------------------------------------
// Variant → palette key mapping
// ---------------------------------------------------------------------------

type PaletteKey = 'primary' | 'secondary' | 'success' | 'warn' | 'danger';

const VARIANT_COLOR: Record<BoxVariant, PaletteKey> = {
  info: 'primary',
  tip: 'secondary',
  success: 'success',
  warn: 'warn',
  error: 'danger',
};

// Default hex values matching DEFAULT_PALETTE (used in ASCII fallback)
const VARIANT_HEX: Record<BoxVariant, string> = {
  info: '#a970ff',
  tip: '#8bd5ff',
  success: '#22c55e',
  warn: '#f5b042',
  error: '#ff5c8a',
};

// ---------------------------------------------------------------------------
// ASCII fallback box drawing
// ---------------------------------------------------------------------------

/**
 * Draw a simple ASCII box using +/-/| characters.
 * Used when boxen is unavailable.
 */
function drawAsciiBox(
  content: string,
  title: string | undefined,
  width: number,
  padding: number,
  colorBorder: (s: string) => string,
): string {
  const innerWidth = width - 2; // subtract left and right border chars

  // Top border
  const topFill = '-'.repeat(innerWidth);
  let topBorder: string;
  if (title) {
    const titleStr = ` ${title} `;
    const remaining = innerWidth - titleStr.length;
    const leftDashes = Math.max(0, Math.floor(remaining / 2));
    const rightDashes = Math.max(0, innerWidth - titleStr.length - leftDashes);
    topBorder = colorBorder('+' + '-'.repeat(leftDashes) + titleStr + '-'.repeat(rightDashes) + '+');
  } else {
    topBorder = colorBorder('+' + topFill + '+');
  }

  const bottomBorder = colorBorder('+' + '-'.repeat(innerWidth) + '+');
  const emptyLine = colorBorder('|') + ' '.repeat(innerWidth) + colorBorder('|');

  const lines: string[] = [];
  lines.push(topBorder);

  // Padding lines above content
  for (let i = 0; i < padding; i++) {
    lines.push(emptyLine);
  }

  // Content lines
  const contentLines = content.split('\n');
  for (const line of contentLines) {
    // Truncate/pad to innerWidth - 2*padding
    const contentInner = innerWidth - 2 * padding;
    const visLen = visibleLength(line);
    if (visLen > contentInner) {
      // Truncate visible content
      lines.push(
        colorBorder('|') +
          ' '.repeat(padding) +
          truncateVisible(line, contentInner) +
          ' '.repeat(padding) +
          colorBorder('|'),
      );
    } else {
      const pad = contentInner - visLen;
      lines.push(
        colorBorder('|') +
          ' '.repeat(padding) +
          line +
          ' '.repeat(pad) +
          ' '.repeat(padding) +
          colorBorder('|'),
      );
    }
  }

  // Padding lines below content
  for (let i = 0; i < padding; i++) {
    lines.push(emptyLine);
  }

  lines.push(bottomBorder);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Visible length (strip ANSI escape sequences)
// ---------------------------------------------------------------------------

const ANSI_ESCAPE_RE = /\x1B\[[0-9;]*m|\x9B[0-9;]*m/g;

function visibleLength(s: string): number {
  return s.replace(ANSI_ESCAPE_RE, '').length;
}

function truncateVisible(s: string, maxLen: number): string {
  // Simple truncation: strip ANSI, truncate, return truncated plain text
  const plain = s.replace(ANSI_ESCAPE_RE, '');
  return plain.slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ThemedBoxRenderer bound to the given capability and theme.
 *
 * @param capability - Detected terminal capability
 * @param theme      - Theme tokens for styling
 */
export async function createThemedBox(
  capability: TerminalCapability,
  theme: ThemeTokens,
): Promise<ThemedBoxRenderer> {
  const [boxen, chalk] = await Promise.all([
    loadBoxen(),
    loadChalk(),
  ]);

  function render(content: string, opts?: ThemedBoxOptions): string {
    const variant: BoxVariant = opts?.variant ?? 'info';
    const title = opts?.title;
    const defaultWidth = Math.min(capability.columns - 4, 80);
    const width = opts?.width ?? defaultWidth;
    const padding = capability.columns < 40 ? 0 : (opts?.padding ?? 1);

    // Determine border color function
    let colorBorder: (s: string) => string;

    if (!capability.color) {
      colorBorder = (s: string) => s;
    } else if (chalk) {
      const hexColor = VARIANT_HEX[variant];
      if (capability.truecolor) {
        colorBorder = (s: string) => chalk.hex(hexColor)(s);
      } else {
        // ANSI 256 approximation
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        const ri = Math.round((r / 255) * 5);
        const gi = Math.round((g / 255) * 5);
        const bi = Math.round((b / 255) * 5);
        const idx = 16 + 36 * ri + 6 * gi + bi;
        colorBorder = (s: string) => chalk.ansi256(idx)(s);
      }
    } else {
      colorBorder = (s: string) => s;
    }

    // Use boxen when available
    if (boxen) {
      try {
        const borderStyle = capability.unicode ? 'round' : 'classic';
        const borderColor = capability.color ? VARIANT_HEX[variant] : undefined;

        const boxenOpts: Parameters<typeof boxen>[1] = {
          borderStyle,
          padding,
          width,
          title,
          titleAlignment: 'left',
        };

        // Apply border color via chalk if available
        if (borderColor && chalk) {
          // boxen accepts borderColor as hex string in newer versions
          (boxenOpts as Record<string, unknown>)['borderColor'] = borderColor;
        }

        return boxen(content, boxenOpts);
      } catch {
        // boxen failed — fall through to ASCII fallback
      }
    }

    // ASCII fallback
    return drawAsciiBox(content, title, Math.max(width, 20), padding, colorBorder);
  }

  return { render };
}
