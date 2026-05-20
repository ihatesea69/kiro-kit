#!/usr/bin/env node
// PreToolUse hook: ensures tests are run before allowing task completion.
// Warns if test execution has not been performed during the session.

const { execSync } = require('child_process');

const input = process.argv.slice(2).join(' ') || '';

// Only check on completion-like actions
if (!input.match(/commit|push|complete|done|finish/i)) {
  process.exit(0);
}

try {
  // Check if test results exist (recent test run)
  const result = execSync('find . -name "test-results" -o -name "*.xml" -path "*/test-results/*" -mmin -30 2>/dev/null', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();

  if (!result) {
    process.stderr.write('[test-runner-guard] Warning: No recent test results found. Run tests before completing.\n');
    process.exit(1);
  }
} catch (err) {
  // If find fails, skip the check
}

process.exit(0);
