#!/usr/bin/env node
/**
 * check-findings.mjs — CI gate over a deep security scan's findings.json.
 *
 * Reads the most recent scan (or an explicit one) and exits non-zero when any
 * finding at or above the fail threshold is still `open`. Zero dependencies;
 * Node >= 18.
 *
 * Usage:
 *   node check-findings.mjs                          # latest scan, fail on CRITICAL/HIGH
 *   node check-findings.mjs --fail-on MEDIUM         # stricter threshold
 *   node check-findings.mjs --scan-dir .kiro/security/scans/2026-07-28-1
 *   node check-findings.mjs --root path/to/workspace
 *   node check-findings.mjs --max-age-days 30        # also fail if the scan is stale
 *   node check-findings.mjs --format github          # emit ::error annotations
 *
 * Exit codes: 0 pass · 1 gate failed · 2 no scan found / unreadable / malformed.
 */
import fs from 'node:fs';
import path from 'node:path';

const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function parseArgs(argv) {
  const args = { failOn: 'HIGH', root: process.cwd(), scanDir: null, maxAgeDays: null, format: 'text' };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=');
    const value = () => (inline !== undefined ? inline : argv[++i]);
    switch (flag) {
      case '--fail-on': args.failOn = value().toUpperCase(); break;
      case '--root': args.root = value(); break;
      case '--scan-dir': args.scanDir = value(); break;
      case '--max-age-days': args.maxAgeDays = Number(value()); break;
      case '--format': args.format = value(); break;
      case '--help': case '-h': args.help = true; break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        process.exit(2);
    }
  }
  return args;
}

/** Newest scan directory under <root>/.kiro/security/scans, or null. */
function latestScanDir(root) {
  const scansDir = path.join(root, '.kiro', 'security', 'scans');
  if (!fs.existsSync(scansDir)) return null;
  // Directory names are <yyyy-mm-dd>-<n>; sort by date then by run number.
  const dirs = fs
    .readdirSync(scansDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .map((name) => {
      const m = /^(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(name);
      return m ? { name, date: m[1], run: Number(m[2]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date === b.date ? a.run - b.run : a.date < b.date ? -1 : 1));
  const newest = dirs[dirs.length - 1];
  return newest ? path.join(scansDir, newest.name) : null;
}

function fail(message) {
  console.error(`check-findings: ${message}`);
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`check-findings.mjs — CI gate over a deep security scan's findings.json

  --fail-on <SEVERITY>   fail on open findings at or above this level (default HIGH)
  --root <path>          workspace root containing .kiro/security/scans (default cwd)
  --scan-dir <path>      check this scan instead of the most recent one
  --max-age-days <n>     also fail when the scan is older than n days
  --format github        emit ::error annotations for GitHub Actions

Exit codes: 0 pass · 1 gate failed · 2 no scan found / unreadable / malformed.`);
  process.exit(0);
}

if (!SEVERITIES.includes(args.failOn)) {
  fail(`--fail-on must be one of ${SEVERITIES.join(', ')} (got "${args.failOn}")`);
}

const scanDir = args.scanDir ?? latestScanDir(args.root);
if (!scanDir) fail(`no scan found under ${path.join(args.root, '.kiro/security/scans')} — run /security:deep-scan first`);

const findingsPath = path.join(scanDir, 'findings.json');
if (!fs.existsSync(findingsPath)) fail(`${findingsPath} does not exist`);

let data;
try {
  data = JSON.parse(fs.readFileSync(findingsPath, 'utf-8'));
} catch (err) {
  fail(`${findingsPath} is not valid JSON: ${err.message}`);
}

const findings = Array.isArray(data.findings) ? data.findings : null;
if (!findings) fail(`${findingsPath} has no "findings" array`);

const threshold = SEVERITIES.indexOf(args.failOn);
const rank = (f) => SEVERITIES.indexOf(String(f.severity ?? '').toUpperCase());

const open = findings.filter((f) => (f.status ?? 'open') === 'open');
const blocking = open.filter((f) => rank(f) >= threshold).sort((a, b) => rank(b) - rank(a));

const counts = Object.fromEntries(SEVERITIES.map((s) => [s, open.filter((f) => rank(f) === SEVERITIES.indexOf(s)).length]));

console.log(`Scan: ${path.relative(args.root, scanDir) || scanDir}`);
console.log(`Open findings: ${SEVERITIES.slice().reverse().map((s) => `${s} ${counts[s]}`).join(' · ')}`);

let stale = false;
if (args.maxAgeDays != null) {
  const scannedAt = data.generatedAt ? Date.parse(data.generatedAt) : NaN;
  if (Number.isNaN(scannedAt)) {
    console.warn('check-findings: findings.json has no parseable generatedAt — skipping the age check');
  } else {
    const ageDays = Math.floor((Date.now() - scannedAt) / 86_400_000);
    console.log(`Scan age: ${ageDays} day(s) (limit ${args.maxAgeDays})`);
    stale = ageDays > args.maxAgeDays;
  }
}

for (const f of blocking) {
  const where = `${f.file ?? '?'}:${f.line ?? 0}`;
  if (args.format === 'github') {
    console.log(`::error file=${f.file ?? ''},line=${f.line ?? 1}::[${f.severity}] ${f.slug ?? f.title ?? 'finding'} — see ${path.posix.join('findings', String(f.slug ?? ''), 'finding.md')}`);
  } else {
    console.log(`  [${f.severity}] ${f.slug ?? f.title ?? 'finding'} — ${where}`);
  }
}

if (blocking.length > 0) {
  console.error(`\nFAIL: ${blocking.length} open finding(s) at or above ${args.failOn}.`);
  process.exit(1);
}
if (stale) {
  console.error(`\nFAIL: scan is older than ${args.maxAgeDays} day(s) — re-run /security:deep-scan.`);
  process.exit(1);
}

console.log(`\nPASS: no open findings at or above ${args.failOn}.`);
