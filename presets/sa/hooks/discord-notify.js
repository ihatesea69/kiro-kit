#!/usr/bin/env node
// Sends a notification to Discord via webhook. Requires DISCORD_WEBHOOK_URL.

const fs = require('fs');
const https = require('https');

const url = process.env.DISCORD_WEBHOOK_URL || '';
if (!url) {
  process.stderr.write('[discord-notify] DISCORD_WEBHOOK_URL not set. Skipping.\n');
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
