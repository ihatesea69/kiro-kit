#!/usr/bin/env node
// Tracks git status changes and logs summary.
// Useful as a PostToolUse or agentStop hook.

const { execSync } = require('child_process');

try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  if (!status) {
    process.stdout.write('[git-status] Working tree clean.\n');
    process.exit(0);
  }

  const lines = status.split('\n');
  const added = lines.filter((l) => l.startsWith('A') || l.startsWith('?')).length;
  const modified = lines.filter((l) => l.startsWith('M') || l.startsWith(' M')).length;
  const deleted = lines.filter((l) => l.startsWith('D') || l.startsWith(' D')).length;

  process.stdout.write(
    `[git-status] ${lines.length} changes: +${added} ~${modified} -${deleted}\n`
  );
} catch (err) {
  process.stderr.write('[git-status] Not a git repository or git unavailable.\n');
}

process.exit(0);
