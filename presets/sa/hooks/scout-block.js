#!/usr/bin/env node
// Best-effort guard: blocks obviously-dangerous shell commands before a tool runs.
// NOTE: a denylist is defense-in-depth, NOT a security boundary — it can be
// bypassed and should not be relied on as the only protection.

const fs = require('fs');

const BLOCKED_PATTERNS = [
  /rm\s+-[a-z]*r[a-z]*f[a-z]*\s+[\/~]/i,   // rm -rf / , rm -Rf ~
  /rm\s+-[a-z]*f[a-z]*r[a-z]*\s+[\/~]/i,   // rm -fr /
  /rm\s+-[a-z]*r[a-z]*f?[a-z]*\s+\$?(HOME|~)/i,
  /\bfind\b[^\n]*\s-delete\b/i,
  /drop\s+(database|table|schema)/i,
  /truncate\s+table/i,
  /delete\s+from\s+\w+\s*;?\s*$/i,
  /format\s+[a-z]:/i,
  /mkfs\./i,
  /dd\s+if=.*of=\/dev/i,
  /chmod\s+-R\s+777\s+\//i,
  />\s*\/dev\/sd[a-z]/i,
  /\w+\(\)\s*\{\s*[^}]*\|[^}]*&[^}]*\}\s*;?\s*\w+/,  // fork bomb (structural)
  /shutdown/i,
  /reboot/i,
  /init\s+0/i,
];

// Hook systems deliver tool context as JSON on stdin; older setups may pass it
// as argv. Read both so the guard actually receives the command to inspect.
function readInput() {
  let fromStdin = '';
  if (!process.stdin.isTTY) {
    try {
      const raw = fs.readFileSync(0, 'utf8');
      if (raw.trim()) {
        try {
          const evt = JSON.parse(raw);
          const ti = evt.tool_input || evt.toolInput || {};
          fromStdin = [ti.command, ti.cmd, ti.script, JSON.stringify(ti)]
            .filter(Boolean).join(' ');
        } catch {
          fromStdin = raw;
        }
      }
    } catch { /* no stdin */ }
  }
  const fromArgv = process.argv.slice(2).join(' ');
  return `${fromStdin} ${fromArgv}`.trim();
}

const input = readInput();
if (input && BLOCKED_PATTERNS.some((p) => p.test(input))) {
  process.stderr.write(`[scout-block] Blocked dangerous command: ${input}\n`);
  process.exit(2);
}
process.exit(0);
