#!/usr/bin/env node
// Security guard: blocks dangerous commands before execution.
// Registered as PreToolUse hook.

const BLOCKED_PATTERNS = [
  /rm\s+(-rf|-fr)\s+[\/~]/i,
  /rm\s+(-rf|-fr)\s+\./i,
  /drop\s+(database|table|schema)/i,
  /truncate\s+table/i,
  /delete\s+from\s+\w+\s*;?\s*$/i,
  /format\s+[a-z]:/i,
  /mkfs\./i,
  /dd\s+if=.*of=\/dev/i,
  /chmod\s+-R\s+777\s+\//i,
  />\s*\/dev\/sd[a-z]/i,
  /:(){ :\|:& };:/,
  /shutdown/i,
  /reboot/i,
  /init\s+0/i,
];

const input = process.argv.slice(2).join(' ') || '';
const blocked = BLOCKED_PATTERNS.some((p) => p.test(input));

if (blocked) {
  process.stderr.write(`[scout-block] Blocked dangerous command: ${input}\n`);
  process.exit(2);
}

process.exit(0);
