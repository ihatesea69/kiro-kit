#!/usr/bin/env node
/**
 * Checks if API client types are in sync with route handlers.
 * Warns if route files changed more recently than client type definitions.
 */

const fs = require('fs');
const path = require('path');

const ROUTE_DIRS = ['src/app/api', 'src/routes'];
const CLIENT_DIRS = ['src/lib/api', 'src/client', 'src/api', 'src/services'];

const cwd = process.cwd();

function getLatestMtime(dir) {
  let latest = 0;
  if (!fs.existsSync(dir)) return 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = getLatestMtime(full);
        if (sub > latest) latest = sub;
      } else if (/\.(ts|js)$/.test(entry.name)) {
        const stat = fs.statSync(full);
        if (stat.mtimeMs > latest) latest = stat.mtimeMs;
      }
    }
  } catch (e) { /* skip */ }
  return latest;
}

let routeMtime = 0;
for (const dir of ROUTE_DIRS) {
  const t = getLatestMtime(path.resolve(cwd, dir));
  if (t > routeMtime) routeMtime = t;
}

if (routeMtime === 0) {
  process.exit(0);
}

let clientMtime = 0;
let clientDir = null;
for (const dir of CLIENT_DIRS) {
  const full = path.resolve(cwd, dir);
  if (fs.existsSync(full)) {
    clientDir = dir;
    clientMtime = getLatestMtime(full);
    break;
  }
}

if (!clientDir) {
  process.exit(0);
}

if (routeMtime > clientMtime) {
  const diff = Math.round((routeMtime - clientMtime) / 1000 / 60);
  process.stdout.write(
    `[api-client-gen] API routes changed ${diff}min after client types.\n` +
    `  Route handlers may be out of sync with ${clientDir}/.\n` +
    '  Consider regenerating API client types.\n'
  );
  process.exit(1);
}

process.exit(0);
