#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

let branch = '';
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
} catch (_) {
  branch = 'no-git';
}

const projectName = path.basename(process.cwd());
const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

process.stdout.write(`${branch} | ${projectName} | ${time}`);
