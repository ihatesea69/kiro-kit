#!/usr/bin/env node
/**
 * Scans migration files for dangerous operations (DROP TABLE, DROP COLUMN, TRUNCATE)
 * and warns before execution.
 */

const fs = require('fs');
const path = require('path');

const MIGRATION_DIRS = ['prisma/migrations', 'drizzle', 'migrations', 'db/migrations', 'src/db/migrations'];
const DANGEROUS_PATTERNS = [
  { pattern: /DROP\s+TABLE/gi, label: 'DROP TABLE' },
  { pattern: /DROP\s+COLUMN/gi, label: 'DROP COLUMN' },
  { pattern: /ALTER\s+TABLE\s+\S+\s+DROP/gi, label: 'ALTER TABLE DROP' },
  { pattern: /TRUNCATE/gi, label: 'TRUNCATE' },
  { pattern: /DELETE\s+FROM\s+\S+\s*;/gi, label: 'DELETE without WHERE' },
];
const SQL_EXTENSIONS = ['.sql', '.ts', '.js'];

const cwd = process.cwd();
const warnings = [];

function findMigrationFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findMigrationFiles(full));
      } else if (SQL_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

let migrationFiles = [];
for (const dir of MIGRATION_DIRS) {
  migrationFiles.push(...findMigrationFiles(path.resolve(cwd, dir)));
}

if (migrationFiles.length === 0) {
  process.exit(0);
}

for (const file of migrationFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(cwd, file);

  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      warnings.push(`${rel}: Contains ${label} (${matches.length} occurrence(s))`);
    }
  }
}

if (warnings.length > 0) {
  process.stdout.write('[migration-safety-check] Dangerous operations detected:\n');
  warnings.forEach((w) => process.stdout.write(`  - ${w}\n`));
  process.stdout.write('  Review these changes carefully before applying.\n');
  process.exit(1);
}

process.exit(0);
