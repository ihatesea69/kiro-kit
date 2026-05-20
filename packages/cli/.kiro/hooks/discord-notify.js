#!/usr/bin/env node
// Sends a notification to Discord via webhook.
// Requires DISCORD_WEBHOOK_URL in hooks/.env or environment.

const https = require('https');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const message = process.argv.slice(2).join(' ') || 'Agent task completed.';

if (!WEBHOOK_URL) {
  process.stderr.write('[discord-notify] DISCORD_WEBHOOK_URL not set. Skipping.\n');
  process.exit(0);
}

const url = new URL(WEBHOOK_URL);
const payload = JSON.stringify({ content: message });

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
};

const req = https.request(options, (res) => {
  process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
});

req.on('error', () => process.exit(1));
req.write(payload);
req.end();
