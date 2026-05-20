/**
 * capability.ts — Terminal capability detector.
 *
 * Single source of truth for what the current terminal can render.
 * Every UI component receives a TerminalCapability and falls back accordingly.
 *
 * Design invariants (always hold):
 *   - truecolor === true  implies  color === true
 *   - animate   === true  implies  isTTY === true
 *   - columns   >= 20
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface TerminalCapability {
  /** stdout is a TTY (not pipe/file) */
  isTTY: boolean;
  /** true unless NO_COLOR / --no-color / non-TTY / CI without FORCE_COLOR */
  color: boolean;
  /** true if terminal likely supports 16M colors (truecolor) */
  truecolor: boolean;
  /** unicode box-drawing/emoji safe (false on legacy Windows cmd) */
  unicode: boolean;
  /** OSC-8 hyperlinks supported */
  hyperlink: boolean;
  /** allow spinners / re-render */
  animate: boolean;
  /** terminal columns (fallback 80, minimum 20) */
  columns: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Detect terminal capabilities from environment, argv, and stream.
 *
 * @param env    - process.env (injectable for testing)
 * @param argv   - process.argv (injectable for testing)
 * @param stream - NodeJS.WriteStream, typically process.stdout
 * @returns Frozen TerminalCapability object (immutable)
 *
 * @example
 * const cap = detectCapability(process.env, process.argv, process.stdout);
 */
export function detectCapability(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
  stream: NodeJS.WriteStream = process.stdout,
): TerminalCapability {
  // -------------------------------------------------------------------------
  // TTY and columns
  // -------------------------------------------------------------------------
  const isTTY = stream.isTTY === true;
  const rawColumns = typeof stream.columns === 'number' ? stream.columns : 80;
  const columns = rawColumns >= 20 ? rawColumns : 80;

  // -------------------------------------------------------------------------
  // Color detection
  // -------------------------------------------------------------------------
  const noColorFlag = Array.isArray(argv) && argv.includes('--no-color');
  const noColorEnv =
    env['NO_COLOR'] !== undefined && env['NO_COLOR'] !== '';
  const forceColor =
    env['FORCE_COLOR'] !== undefined && env['FORCE_COLOR'] !== '0';

  let color: boolean;
  let truecolor: boolean;

  if (noColorFlag || noColorEnv) {
    color = false;
    truecolor = false;
  } else if (!isTTY && !forceColor) {
    color = false;
    truecolor = false;
  } else {
    color = true;
    const colorterm = env['COLORTERM'];
    truecolor =
      colorterm === 'truecolor' || colorterm === '24bit' || forceColor;
  }

  // -------------------------------------------------------------------------
  // Unicode detection
  // -------------------------------------------------------------------------
  let unicode: boolean;

  if (
    process.platform === 'win32' &&
    env['WT_SESSION'] === undefined &&
    env['TERM_PROGRAM'] === undefined
  ) {
    unicode = false;
  } else if (env['TERM'] === 'dumb') {
    unicode = false;
  } else {
    unicode = true;
  }

  // -------------------------------------------------------------------------
  // Hyperlink detection (best-effort, OSC-8)
  // -------------------------------------------------------------------------
  const termProgram = env['TERM_PROGRAM'];
  const hyperlinkTerminals = new Set([
    'iTerm.app',
    'WezTerm',
    'vscode',
    'Hyper',
  ]);
  const hyperlink =
    isTTY && color && termProgram !== undefined && hyperlinkTerminals.has(termProgram);

  // -------------------------------------------------------------------------
  // Animation
  // -------------------------------------------------------------------------
  const isCI = env['CI'] !== undefined && env['CI'] !== '';
  const animate = isTTY && (!isCI || forceColor);

  // -------------------------------------------------------------------------
  // Invariant assertions (always hold by construction)
  // truecolor → color, animate → isTTY
  // -------------------------------------------------------------------------

  const result: TerminalCapability = {
    isTTY,
    color,
    truecolor,
    unicode,
    hyperlink,
    animate,
    columns,
  };

  return Object.freeze(result);
}
