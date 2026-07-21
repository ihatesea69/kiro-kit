#!/usr/bin/env node
/**
 * harden-hooks.mjs
 *
 * Distributes security-hardened versions of the shipped hook scripts to every
 * `hooks/` directory that already contains a file of that name (presets + the
 * repo's own .kiro/hooks). Only overwrites existing files — never adds new ones,
 * so no manifest orphans are created.
 *
 * Fixes:
 *  - discord/telegram .sh: build JSON safely (no injection / malformed payloads).
 *  - telegram .sh/.ps1: keep the bot token out of the process table.
 *  - scout-block.js: read tool context from stdin JSON (with argv fallback) so
 *    the guard actually receives input; broaden a few patterns.
 *  - discord/telegram .js: read the message from stdin/argv, not argv only.
 *  - build-verify.js: actually block (exit 1) when artifacts are missing.
 *  - scout-block.sh: regex matching + honest "best-effort" note.
 *
 * Usage: node scripts/harden-hooks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const FILES = {
  'discord-notify.sh': `#!/usr/bin/env bash
# Sends a notification to Discord via webhook. Requires DISCORD_WEBHOOK_URL.

MESSAGE="\${*:-Agent task completed.}"

if [ -z "\$DISCORD_WEBHOOK_URL" ]; then
  echo "[discord-notify] DISCORD_WEBHOOK_URL not set. Skipping." >&2
  exit 0
fi

# Build JSON safely so quotes/newlines/backslashes in the message cannot break
# the payload or inject additional webhook fields. Prefer jq; otherwise use node
# (guaranteed present — kiro-kit requires Node) for correct JSON encoding.
if command -v jq >/dev/null 2>&1; then
  payload=$(jq -n --arg content "\$MESSAGE" '{content:$content}')
else
  payload=$(MSG="\$MESSAGE" node -e 'process.stdout.write(JSON.stringify({content:process.env.MSG||""}))')
fi

curl -s -o /dev/null -w "%{http_code}" \\
  -H "Content-Type: application/json" \\
  -d "\$payload" \\
  "\$DISCORD_WEBHOOK_URL" | grep -q "^2" && exit 0 || exit 1
`,

  'telegram-notify.sh': `#!/usr/bin/env bash
# Sends a Telegram notification. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.

MESSAGE="\${*:-Agent task completed.}"

if [ -z "\$TELEGRAM_BOT_TOKEN" ] || [ -z "\$TELEGRAM_CHAT_ID" ]; then
  echo "[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping." >&2
  exit 0
fi

# Build JSON safely (no injection via message or chat id). Prefer jq; otherwise
# use node (guaranteed present) for correct JSON encoding.
if command -v jq >/dev/null 2>&1; then
  payload=$(jq -n --arg chat_id "\$TELEGRAM_CHAT_ID" --arg text "\$MESSAGE" '{chat_id:$chat_id, text:$text}')
else
  payload=$(CID="\$TELEGRAM_CHAT_ID" MSG="\$MESSAGE" node -e 'process.stdout.write(JSON.stringify({chat_id:process.env.CID||"",text:process.env.MSG||""}))')
fi

# Pass the token-bearing URL via a curl config file on stdin so the token does
# NOT appear in the process table (ps / /proc/<pid>/cmdline) as an argument.
curl -s -o /dev/null -w "%{http_code}" \\
  -H "Content-Type: application/json" \\
  -d "\$payload" \\
  --config - <<CURLCFG | grep -q "^2" && exit 0 || exit 1
url = "https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage"
CURLCFG
`,

  'telegram-notify.ps1': `# Sends a Telegram notification. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.

$Message = if ($args.Count -gt 0) { $args -join ' ' } else { 'Agent task completed.' }
$Token = $env:TELEGRAM_BOT_TOKEN
$ChatId = $env:TELEGRAM_CHAT_ID

if (-not $Token -or -not $ChatId) {
    Write-Error "[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping."
    exit 0
}

# ConvertTo-Json safely encodes the message; the token stays in a variable and
# is never placed on a command line (avoids exposure in process/logging).
$Body = @{ chat_id = $ChatId; text = $Message } | ConvertTo-Json -Compress
$Uri = "https://api.telegram.org/bot$Token/sendMessage"
try {
    Invoke-RestMethod -Uri $Uri -Method Post -Body $Body -ContentType 'application/json' | Out-Null
    exit 0
} catch {
    exit 1
}
`,

  'discord-notify.js': `#!/usr/bin/env node
// Sends a notification to Discord via webhook. Requires DISCORD_WEBHOOK_URL.

const fs = require('fs');
const https = require('https');

const url = process.env.DISCORD_WEBHOOK_URL || '';
if (!url) {
  process.stderr.write('[discord-notify] DISCORD_WEBHOOK_URL not set. Skipping.\\n');
  process.exit(0);
}

// Hook systems may deliver context via stdin (JSON) or argv. Support both.
function resolveMessage() {
  const argv = process.argv.slice(2).join(' ').trim();
  if (argv) return argv;
  if (!process.stdin.isTTY) {
    try {
      const raw = fs.readFileSync(0, 'utf8').trim();
      if (raw) {
        try {
          const evt = JSON.parse(raw);
          return evt.message || evt.summary || evt.reason || 'Agent task completed.';
        } catch {
          return raw.slice(0, 1500);
        }
      }
    } catch { /* no stdin */ }
  }
  return 'Agent task completed.';
}

const payload = JSON.stringify({ content: resolveMessage() });
const u = new URL(url);
const req = https.request(
  { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
  (res) => process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1),
);
req.on('error', () => process.exit(1));
req.write(payload);
req.end();
`,

  'telegram-notify.js': `#!/usr/bin/env node
// Sends a notification to Telegram via bot API.
// Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in environment.

const fs = require('fs');
const https = require('https');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TOKEN || !CHAT_ID) {
  process.stderr.write('[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping.\\n');
  process.exit(0);
}

// Hook systems may deliver context via stdin (JSON) or argv. Support both.
function resolveMessage() {
  const argv = process.argv.slice(2).join(' ').trim();
  if (argv) return argv;
  if (!process.stdin.isTTY) {
    try {
      const raw = fs.readFileSync(0, 'utf8').trim();
      if (raw) {
        try {
          const evt = JSON.parse(raw);
          return evt.message || evt.summary || evt.reason || 'Agent task completed.';
        } catch {
          return raw.slice(0, 1500);
        }
      }
    } catch { /* no stdin */ }
  }
  return 'Agent task completed.';
}

const payload = JSON.stringify({ chat_id: CHAT_ID, text: resolveMessage() });
const options = {
  hostname: 'api.telegram.org',
  path: \`/bot\${TOKEN}/sendMessage\`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
};

const req = https.request(options, (res) => {
  process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.write(payload);
req.end();
`,

  'scout-block.js': `#!/usr/bin/env node
// Best-effort guard: blocks obviously-dangerous shell commands before a tool runs.
// NOTE: a denylist is defense-in-depth, NOT a security boundary — it can be
// bypassed and should not be relied on as the only protection.

const fs = require('fs');

const BLOCKED_PATTERNS = [
  /rm\\s+-[a-z]*r[a-z]*f[a-z]*\\s+[\\/~]/i,   // rm -rf / , rm -Rf ~
  /rm\\s+-[a-z]*f[a-z]*r[a-z]*\\s+[\\/~]/i,   // rm -fr /
  /rm\\s+-[a-z]*r[a-z]*f?[a-z]*\\s+\\$?(HOME|~)/i,
  /\\bfind\\b[^\\n]*\\s-delete\\b/i,
  /drop\\s+(database|table|schema)/i,
  /truncate\\s+table/i,
  /delete\\s+from\\s+\\w+\\s*;?\\s*$/i,
  /format\\s+[a-z]:/i,
  /mkfs\\./i,
  /dd\\s+if=.*of=\\/dev/i,
  /chmod\\s+-R\\s+777\\s+\\//i,
  />\\s*\\/dev\\/sd[a-z]/i,
  /\\w+\\(\\)\\s*\\{\\s*[^}]*\\|[^}]*&[^}]*\\}\\s*;?\\s*\\w+/,  // fork bomb (structural)
  /shutdown/i,
  /reboot/i,
  /init\\s+0/i,
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
  return \`\${fromStdin} \${fromArgv}\`.trim();
}

const input = readInput();
if (input && BLOCKED_PATTERNS.some((p) => p.test(input))) {
  process.stderr.write(\`[scout-block] Blocked dangerous command: \${input}\\n\`);
  process.exit(2);
}
process.exit(0);
`,

  'scout-block.sh': `#!/usr/bin/env bash
# Best-effort guard: blocks obviously-dangerous commands before execution.
# NOTE: a denylist is defense-in-depth, NOT a security boundary — it can be
# bypassed. The .js variant (used as the primary PreToolUse hook) is authoritative.

INPUT="$*"

# ERE patterns with [[:space:]] so alternate spacing does not trivially bypass.
PATTERNS=(
  'rm[[:space:]]+-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+[/~]'
  'rm[[:space:]]+-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+\\$?(HOME)'
  'find[[:space:]].*-delete'
  'drop[[:space:]]+(database|table|schema)'
  'truncate[[:space:]]+table'
  'mkfs\\.'
  'dd[[:space:]]+if=.*of=/dev'
  'chmod[[:space:]]+-R[[:space:]]+777[[:space:]]+/'
  '>[[:space:]]*/dev/sd[a-z]'
  'shutdown'
  'reboot'
  'init[[:space:]]+0'
  'format[[:space:]]+[a-z]:'
)

shopt -s nocasematch
for pattern in "\${PATTERNS[@]}"; do
  if [[ "$INPUT" =~ $pattern ]]; then
    echo "[scout-block] Blocked dangerous command: $INPUT" >&2
    exit 2
  fi
done
exit 0
`,

  'build-verify.js': `#!/usr/bin/env node
// PreToolUse guard: blocks when no build artifacts are present, to prevent
// deploying a stale or missing build. Exits non-zero (blocks) on failure.

const fs = require('fs');
const path = require('path');

const ARTIFACT_DIRS = ['dist', 'build', 'out', '.next', 'target'];
const cwd = process.cwd();

const hasArtifact = ARTIFACT_DIRS.some((d) => {
  const p = path.resolve(cwd, d);
  try {
    return fs.existsSync(p) && fs.readdirSync(p).length > 0;
  } catch {
    return false;
  }
});

if (!hasArtifact) {
  process.stderr.write(
    '[build-verify] No build artifacts found (dist/build/out/.next/target). ' +
      'Run your build before deploying.\\n',
  );
  process.exit(1); // block
}

process.exit(0);
`,
};

let count = 0;
const hooksDirs = new Set();

// Collect every hooks/ directory in the repo (presets + root .kiro).
function collectHooksDirs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'hooks') hooksDirs.add(full);
      else collectHooksDirs(full);
    }
  }
}
collectHooksDirs(path.join(repoRoot, 'presets'));
if (fs.existsSync(path.join(repoRoot, '.kiro/hooks'))) hooksDirs.add(path.join(repoRoot, '.kiro/hooks'));

for (const dir of hooksDirs) {
  for (const [name, content] of Object.entries(FILES)) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) {
      fs.writeFileSync(file, content, 'utf-8');
      count++;
    }
  }
}
console.log(`Hardened ${count} hook file(s) across ${hooksDirs.size} hooks/ dir(s).`);
