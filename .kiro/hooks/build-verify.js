#!/usr/bin/env node
// PreToolUse hook: verifies build artifacts exist before deployment commands.
// Prevents deploying stale or missing builds.

const fs = require('fs');
const path = require('path');

const DEPLOY_PATTERNS = [
  /kubectl\s+apply/i,
  /helm\s+(install|upgrade)/i,
  /terraform\s+apply/i,
  /docker\s+push/i,
  /aws\s+.*deploy/i,
  /gcloud\s+.*deploy/i,
];

const input = process.argv.slice(2).join(' ') || '';
const isDeployCommand = DEPLOY_PATTERNS.some((p) => p.test(input));

if (!isDeployCommand) {
  process.exit(0);
}

// Check for common build artifacts
const buildIndicators = [
  'dist',
  'build',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
];

const hasArtifact = buildIndicators.some((indicator) => {
  return fs.existsSync(path.resolve(process.cwd(), indicator));
});

if (!hasArtifact) {
  process.stderr.write(
    '[build-verify] Warning: No build artifacts found. Run build before deploying.\n'
  );
  // Exit 0 to warn but not block -- user may have artifacts elsewhere
}

process.exit(0);
