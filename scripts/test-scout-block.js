#!/usr/bin/env node
/**
 * Test script for scout-block hook (Node.js tri-script equivalent).
 * Validates that the scout-block hook correctly blocks/allows commands.
 *
 * Usage: node scripts/test-scout-block.js
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.join('.kiro', 'hooks', 'scout-block.js');

function runTest(testName, inputJson, expectedExit) {
  try {
    execSync(`echo '${inputJson}' | node ${HOOK_PATH}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    // Exit code 0
    if (expectedExit === 0) {
      console.log(`PASS: ${testName}`);
      return true;
    } else {
      console.log(`FAIL: ${testName} (Expected exit ${expectedExit}, got 0)`);
      return false;
    }
  } catch (err) {
    const exitCode = err.status || 1;
    if (exitCode === expectedExit) {
      console.log(`PASS: ${testName}`);
      return true;
    } else {
      console.log(`FAIL: ${testName} (Expected exit ${expectedExit}, got ${exitCode})`);
      return false;
    }
  }
}

console.log('=== Testing scout-block hook ===\n');

const tests = [
  { name: 'Allowed command (ls -la)', input: '{"tool_input":{"command":"ls -la"}}', expected: 0 },
  { name: 'Blocked - node_modules', input: '{"tool_input":{"command":"ls node_modules"}}', expected: 2 },
  { name: 'Blocked - .git/', input: '{"tool_input":{"command":"cd .git/ && ls"}}', expected: 2 },
  { name: 'Blocked - __pycache__', input: '{"tool_input":{"command":"find __pycache__"}}', expected: 2 },
  { name: 'Blocked - dist/', input: '{"tool_input":{"command":"cat dist/bundle.js"}}', expected: 2 },
  { name: 'Blocked - build/', input: '{"tool_input":{"command":"rm -rf build/"}}', expected: 2 },
  { name: 'Allowed - .env file', input: '{"tool_input":{"command":"cat .env"}}', expected: 0 },
  { name: 'Invalid JSON', input: 'invalid json', expected: 2 },
  { name: 'Empty command', input: '{"tool_input":{"command":""}}', expected: 2 },
  { name: 'Missing command field', input: '{"tool_input":{}}', expected: 2 },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  if (runTest(test.name, test.input, test.expected)) {
    passed++;
  } else {
    failed++;
  }
}

console.log(`\n=== Test Results ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
