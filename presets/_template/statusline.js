#!/usr/bin/env node
// Statusline: outputs git branch + project name + time on one line.

const { execSync } = require('child_process');
const path = require('path');

let branch = '';
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
} catch (e) {
  // Not a git repo
}

const projectName = path.basename(process.cwd());
const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const parts = [];
if (branch) parts.push(branch);
parts.push(projectName);
parts.push(time);

process.stdout.write(parts.join(' | ') + '\n');
