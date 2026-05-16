#!/usr/bin/env node
// Sends a notification to Telegram via bot API.
// Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in environment.

const https = require('https');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const message = process.argv.slice(2).join(' ') || 'Agent task completed.';

if (!TOKEN || !CHAT_ID) {
  process.stderr.write('[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Skipping.\n');
  process.exit(0);
}

const payload = JSON.stringify({ chat_id: CHAT_ID, text: message });
const options = {
  hostname: 'api.telegram.org',
  path: `/bot${TOKEN}/sendMessage`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
};

const req = https.request(options, (res) => {
  process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
});

req.on('error', () => process.exit(1));
req.write(payload);
req.end();
