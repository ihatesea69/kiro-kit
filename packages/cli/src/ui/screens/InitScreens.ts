/**
 * InitScreens.ts — Composed UI screens for the init command.
 *
 * Assembles Logo, ThemedBox, and theme primitives into the three screens
 * that init.ts calls sequentially:
 *   1. welcome(data)  — logo + tip box + command list
 *   2. summary(data)  — success box with file counts, paths, next steps
 *   3. errorBox(err)  — error box with message + verbose hint
 *
 * Security: any string sourced from the filesystem (paths) is sanitized
 * by stripping ANSI escape sequences before rendering.
 *
 * This module is pure presentation — it never imports from src/core/*.
 */

import type { TerminalCapability } from '../capability.js';
import type { ThemeTokens } from '../theme.js';
import { createLogo } from '../Logo.js';
import { createThemedBox } from '../ThemedBox.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface InitContext {
  capability: TerminalCapability;
  theme: ThemeTokens;
  cliVersion: string;
}

export interface WelcomeData {
  cliVersion: string;
  /** Content for the "Did you know?" tip box */
  tipText: string;
  commands: Array<{ name: string; description: string }>;
}

export interface SummaryData {
  filesWritten: number;
  filesSkipped: number;
  presets: string[];
  /** If defined, shown as "Setup guide: <path>" */
  setupGuidePath?: string;
  /** If defined, shown as "Env template: <path>" */
  envExamplePath?: string;
  nextSteps: string[];
  docsUrl: string;
}

export interface InitScreens {
  welcome(data: WelcomeData): void;
  summary(data: SummaryData): void;
  errorBox(err: Error): void;
}

// ---------------------------------------------------------------------------
// Sanitization helper
// ---------------------------------------------------------------------------

/**
 * Strip ANSI/CSI escape sequences from a string.
 * Removes both ESC-based (\x1B[...m) and C1-based (\x9B[...m) sequences.
 * Applied to any string sourced from the filesystem before rendering.
 */
function sanitizePath(s: string): string {
  // Strip ESC [ ... sequences (CSI) and standalone ESC sequences
  // Also strip C1 CSI (\x9B) sequences
  return s
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x9B[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1B[^[]/g, '');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the InitScreens object for the given context.
 *
 * All component factories are async; this factory pre-loads them so that
 * the returned screen methods are synchronous (no await at call site).
 *
 * @param ctx - InitContext with capability, theme, and cliVersion
 */
export async function createInitScreens(ctx: InitContext): Promise<InitScreens> {
  const { capability, theme, cliVersion } = ctx;

  // Pre-load async component factories
  const [logo, box] = await Promise.all([
    createLogo(capability, theme),
    createThemedBox(capability, theme),
  ]);

  // -------------------------------------------------------------------------
  // welcome(data)
  // Implements Algorithm: renderInitWelcome from design.md
  // -------------------------------------------------------------------------
  function welcome(data: WelcomeData): void {
    // 1. Logo
    const logoStr = logo.render({
      text: 'kiro-kit',
      font: 'ANSI Shadow',
      version: data.cliVersion,
      subtitle: 'Engineer-grade Kiro presets',
    });
    process.stdout.write(logoStr + '\n');

    // 2. Blank line
    process.stdout.write('\n');

    // 3. Tip box (variant='tip', title='Did you know?')
    const tipBox = box.render(data.tipText, {
      title: 'Did you know?',
      variant: 'tip',
    });
    process.stdout.write(tipBox + '\n');

    // 4. Blank line
    process.stdout.write('\n');

    // 5. Heading + command list
    process.stdout.write(theme.heading('Available commands:') + '\n');

    for (const cmd of data.commands) {
      // Pad the raw name to 20 chars first, then apply styling so ANSI
      // escape bytes don't inflate the visible width calculation.
      const paddedName = theme.command(cmd.name.padEnd(20));
      const desc = theme.muted(cmd.description);
      process.stdout.write(`  ${paddedName}${desc}\n`);
    }

    // 6. Trailing blank line
    process.stdout.write('\n');
  }

  // -------------------------------------------------------------------------
  // summary(data)
  // Renders a success box with file counts, preset list, optional paths,
  // next steps, and a docs link.
  // -------------------------------------------------------------------------
  function summary(data: SummaryData): void {
    const lines: string[] = [];

    // File counts
    lines.push(
      `${theme.success(String(data.filesWritten))} files written, ` +
        `${theme.muted(String(data.filesSkipped))} skipped`,
    );

    // Preset list
    lines.push(`Presets: ${theme.command(data.presets.join(', '))}`);

    // Optional paths — sanitize before rendering
    if (data.setupGuidePath !== undefined) {
      const safePath = sanitizePath(data.setupGuidePath);
      lines.push(`Setup guide: ${theme.pathStyle(safePath)}`);
    }

    if (data.envExamplePath !== undefined) {
      const safePath = sanitizePath(data.envExamplePath);
      lines.push(`Env template: ${theme.pathStyle(safePath)}`);
    }

    // Next steps
    if (data.nextSteps.length > 0) {
      lines.push('');
      lines.push(theme.heading('Next steps:'));
      for (const step of data.nextSteps) {
        lines.push(`  ${theme.muted('\u2022')} ${step}`);
      }
    }

    // Docs URL
    lines.push('');
    lines.push(theme.link('Docs', data.docsUrl));

    const content = lines.join('\n');
    const successBox = box.render(content, {
      title: 'Done!',
      variant: 'success',
    });

    process.stdout.write('\n' + successBox + '\n');
  }

  // -------------------------------------------------------------------------
  // errorBox(err)
  // Renders an error box with the error message and a verbose hint.
  // -------------------------------------------------------------------------
  function errorBox(err: Error): void {
    const content =
      theme.danger(err.message) +
      '\n\n' +
      theme.muted('Run with --verbose for details');

    const errBox = box.render(content, {
      title: 'Error',
      variant: 'error',
    });

    process.stderr.write('\n' + errBox + '\n');
  }

  return { welcome, summary, errorBox };
}
