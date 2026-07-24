#!/usr/bin/env node
// PostToolUse hook: reminds to scan container images after docker build.
// Checks if a docker build was just executed and suggests scanning.

const DOCKER_BUILD_PATTERNS = [
  /docker\s+build/i,
  /docker\s+compose\s+build/i,
  /podman\s+build/i,
  /buildah\s+bud/i,
  /nerdctl\s+build/i,
];

const input = process.argv.slice(2).join(' ') || '';
const isDockerBuild = DOCKER_BUILD_PATTERNS.some((p) => p.test(input));

if (!isDockerBuild) {
  process.exit(0);
}

process.stdout.write(
  '[image-scan] Container image built. Run vulnerability scan before pushing:\n' +
  '  trivy image <image-name>\n' +
  '  grype <image-name>\n' +
  '  docker scout cves <image-name>\n'
);

process.exit(0);
