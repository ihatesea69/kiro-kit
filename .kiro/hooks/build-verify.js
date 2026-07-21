#!/usr/bin/env node
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
      'Run your build before deploying.\n',
  );
  process.exit(1); // block
}

process.exit(0);
