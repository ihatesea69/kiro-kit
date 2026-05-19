import readline from 'node:readline';
import { color } from '../utils/color.js';
import type { PowerEntry, PowerTier } from '../core/PowersLoader.js';

/**
 * PowersPrompter — interactive tier selection and formatted display
 * for Powers recommendations during init flow.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PowersPromptResult {
  selectedTiers: PowerTier[];
  confirmMCP: boolean;
}

export interface PowersPromptFlags {
  powersFlag?: string;
  yes?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_ORDER: PowerTier[] = ['essential', 'recommended', 'optional'];

const TIER_LABELS: Record<PowerTier, string> = {
  essential: 'Essential',
  recommended: 'Recommended',
  optional: 'Optional',
};

const TIER_OPTIONS: Array<{ label: string; tiers: PowerTier[] }> = [
  { label: 'Essential only', tiers: ['essential'] },
  { label: 'Essential + Recommended', tiers: ['essential', 'recommended'] },
  { label: 'All (Essential + Recommended + Optional)', tiers: ['essential', 'recommended', 'optional'] },
  { label: 'None (skip Powers)', tiers: [] },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Prompt user for Powers tier selection.
 * Respects --powers and --yes flags to skip interactive prompts.
 *
 * - flags.powersFlag === 'none': return empty tiers, confirmMCP=false
 * - flags.powersFlag === 'all': return all tiers, confirmMCP=true
 * - flags.yes === true: return ['essential', 'recommended'] as default, confirmMCP=true
 * - Otherwise: prompt user interactively
 */
export async function promptPowersTier(
  powers: PowerEntry[],
  flags: PowersPromptFlags,
): Promise<PowersPromptResult> {
  // No powers available — nothing to prompt
  if (powers.length === 0) {
    return { selectedTiers: [], confirmMCP: false };
  }

  // --powers=none: skip entirely
  if (flags.powersFlag === 'none') {
    return { selectedTiers: [], confirmMCP: false };
  }

  // --powers=all: include everything
  if (flags.powersFlag === 'all') {
    return { selectedTiers: ['essential', 'recommended', 'optional'], confirmMCP: true };
  }

  // --yes: use sensible defaults without prompting
  if (flags.yes === true) {
    return { selectedTiers: ['essential', 'recommended'], confirmMCP: true };
  }

  // Interactive mode
  return interactiveTierPrompt(powers);
}

/**
 * Display formatted Powers recommendations in terminal.
 * Groups by tier (essential -> recommended -> optional), shows URLs,
 * and prints a summary count at the end.
 *
 * Skips display when quiet=true.
 */
export function displayPowersRecommendations(
  powers: PowerEntry[],
  quiet: boolean,
): void {
  if (quiet || powers.length === 0) {
    return;
  }

  process.stdout.write('\n');
  process.stdout.write(color.bold('Recommended Kiro Powers:') + '\n');

  for (const tier of TIER_ORDER) {
    const tierPowers = powers.filter((p) => p.tier === tier);
    if (tierPowers.length === 0) continue;

    process.stdout.write('\n');
    process.stdout.write(`  ${color.cyan(TIER_LABELS[tier])}:\n`);

    for (const power of tierPowers) {
      process.stdout.write(`    ${color.bold(power.name)} - ${power.description}\n`);
      process.stdout.write(`      ${color.dim(power.url)}\n`);
    }
  }

  // Summary count
  const counts = countByTier(powers);
  const parts: string[] = [];
  if (counts.essential > 0) parts.push(`${counts.essential} essential`);
  if (counts.recommended > 0) parts.push(`${counts.recommended} recommended`);
  if (counts.optional > 0) parts.push(`${counts.optional} optional`);

  process.stdout.write('\n');
  process.stdout.write(color.dim(`${parts.join(', ')} Powers recommended`) + '\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function countByTier(powers: PowerEntry[]): Record<PowerTier, number> {
  const counts: Record<PowerTier, number> = { essential: 0, recommended: 0, optional: 0 };
  for (const p of powers) {
    counts[p.tier]++;
  }
  return counts;
}

/**
 * Interactive single-select prompt for tier selection using readline.
 * Arrow keys to navigate, Enter to confirm.
 */
async function interactiveTierPrompt(powers: PowerEntry[]): Promise<PowersPromptResult> {
  if (!process.stdin.isTTY) {
    // Non-interactive fallback: use defaults
    return { selectedTiers: ['essential', 'recommended'], confirmMCP: true };
  }

  return new Promise<PowersPromptResult>((resolve, reject) => {
    let cursor = 1; // Default to "Essential + Recommended"
    let rendered = false;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    const render = (): void => {
      if (rendered) {
        process.stdout.write('\x1B[u');
      } else {
        process.stdout.write('\x1B[s');
      }
      rendered = true;
      process.stdout.write('\x1B[J');
      process.stdout.write(
        color.bold('? Which Powers tiers to include in setup guide?') +
          color.dim(' (Arrow keys to select, Enter to confirm)') +
          '\n',
      );
      for (let i = 0; i < TIER_OPTIONS.length; i++) {
        const marker = cursor === i ? color.cyan('>') : ' ';
        const label = cursor === i
          ? color.cyan(TIER_OPTIONS[i].label)
          : TIER_OPTIONS[i].label;
        process.stdout.write(`  ${marker} ${label}\n`);
      }
    };

    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    let escBuffer = '';

    const handleArrow = (seq: string): boolean => {
      if (seq === '\x1B[A' || seq === '\x1BOA') {
        cursor = (cursor - 1 + TIER_OPTIONS.length) % TIER_OPTIONS.length;
        render();
        return true;
      }
      if (seq === '\x1B[B' || seq === '\x1BOB') {
        cursor = (cursor + 1) % TIER_OPTIONS.length;
        render();
        return true;
      }
      return false;
    };

    const cleanup = (): void => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
      rl.close();
    };

    const onData = (key: string): void => {
      // Buffered escape sequence
      if (escBuffer.length > 0) {
        escBuffer += key;
        if (escBuffer.length >= 3) {
          const seq = escBuffer;
          escBuffer = '';
          handleArrow(seq);
        }
        return;
      }

      // Full escape sequence in one chunk
      if (key.length >= 3 && key.startsWith('\x1B')) {
        handleArrow(key);
        return;
      }

      // Start of escape sequence
      if (key === '\x1B') {
        escBuffer = key;
        setTimeout(() => {
          if (escBuffer.length > 0) {
            escBuffer = '';
          }
        }, 50);
        return;
      }

      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        reject(new Error('SIGINT'));
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        cleanup();
        const selected = TIER_OPTIONS[cursor];
        const confirmMCP = selected.tiers.length > 0;
        resolve({ selectedTiers: selected.tiers, confirmMCP });
        return;
      }

      // Arrow up / k
      if (key === 'k') {
        cursor = (cursor - 1 + TIER_OPTIONS.length) % TIER_OPTIONS.length;
        render();
        return;
      }

      // Arrow down / j
      if (key === 'j') {
        cursor = (cursor + 1) % TIER_OPTIONS.length;
        render();
        return;
      }
    };

    process.stdin.on('data', onData);
  });
}
