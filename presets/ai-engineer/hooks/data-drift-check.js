#!/usr/bin/env node
/**
 * Checks for schema changes in data models that could indicate data drift.
 * Compares current vs baseline schema files.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_DIRS = ['src/data', 'data/schemas', 'schemas', 'src/models'];
const BASELINE_DIR = 'data/baseline';
const SCHEMA_EXTENSIONS = ['.json', '.yaml', '.yml', '.avsc', '.proto'];

const cwd = process.cwd();

function findSchemaFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findSchemaFiles(full));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCHEMA_EXTENSIONS.includes(ext) && entry.name.includes('schema')) {
          results.push(full);
        }
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

let schemaFiles = [];
for (const dir of SCHEMA_DIRS) {
  schemaFiles.push(...findSchemaFiles(path.resolve(cwd, dir)));
}

if (schemaFiles.length === 0) {
  process.exit(0);
}

const baselineDir = path.resolve(cwd, BASELINE_DIR);
if (!fs.existsSync(baselineDir)) {
  process.stdout.write(
    '[data-drift-check] No baseline directory found at data/baseline/.\n' +
    '  Create baseline schemas to enable drift detection.\n'
  );
  process.exit(0);
}

const drifted = [];

for (const schemaFile of schemaFiles) {
  const name = path.basename(schemaFile);
  const baselinePath = path.join(baselineDir, name);

  if (!fs.existsSync(baselinePath)) continue;

  const current = fs.readFileSync(schemaFile, 'utf8').trim();
  const baseline = fs.readFileSync(baselinePath, 'utf8').trim();

  if (current !== baseline) {
    drifted.push(path.relative(cwd, schemaFile));
  }
}

if (drifted.length > 0) {
  process.stdout.write(`[data-drift-check] ${drifted.length} schema(s) differ from baseline:\n`);
  drifted.forEach((d) => process.stdout.write(`  - ${d}\n`));
  process.stdout.write('  Verify changes are intentional and update baseline if so.\n');
  process.exit(1);
}

process.exit(0);
