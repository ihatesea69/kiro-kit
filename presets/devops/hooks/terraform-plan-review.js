#!/usr/bin/env node
/**
 * Parses terraform plan output for destructive changes (destroy, replace)
 * and highlights them for review.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cwd = process.cwd();
const PLAN_FILES = ['tfplan.txt', 'plan.txt', 'terraform.plan.txt'];

let planContent = '';

// Try to read a saved plan output file
for (const pf of PLAN_FILES) {
  const full = path.resolve(cwd, pf);
  if (fs.existsSync(full)) {
    planContent = fs.readFileSync(full, 'utf8');
    break;
  }
}

// If no plan file, try to run terraform show on binary plan
if (!planContent) {
  const binaryPlan = path.resolve(cwd, 'tfplan');
  if (fs.existsSync(binaryPlan)) {
    try {
      planContent = execSync('terraform show -no-color tfplan', {
        cwd,
        encoding: 'utf8',
        timeout: 30000,
      });
    } catch (e) { /* skip */ }
  }
}

if (!planContent) {
  process.exit(0);
}

const DESTRUCTIVE_PATTERNS = [
  { pattern: /will be destroyed/g, label: 'DESTROY' },
  { pattern: /must be replaced/g, label: 'REPLACE' },
  { pattern: /forces replacement/g, label: 'FORCE REPLACE' },
];

const findings = [];

for (const { pattern, label } of DESTRUCTIVE_PATTERNS) {
  const matches = planContent.match(pattern);
  if (matches) {
    findings.push({ label, count: matches.length });
  }
}

if (findings.length > 0) {
  process.stdout.write('[terraform-plan-review] Destructive changes detected:\n');
  findings.forEach((f) => {
    process.stdout.write(`  - ${f.label}: ${f.count} resource(s)\n`);
  });
  process.stdout.write('  Review plan carefully before applying.\n');
  process.exit(1);
}

process.exit(0);
