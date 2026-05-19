#!/usr/bin/env node
/**
 * Scans assets/ directory for images over 500KB and suggests optimization.
 */

const fs = require('fs');
const path = require('path');

const ASSET_DIRS = ['assets', 'src/assets', 'lib/assets', 'public/assets'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff'];
const THRESHOLD_KB = 500;

const cwd = process.cwd();

function findLargeImages(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findLargeImages(full));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
          const stat = fs.statSync(full);
          const sizeKB = Math.round(stat.size / 1024);
          if (sizeKB > THRESHOLD_KB) {
            results.push({ file: path.relative(cwd, full), sizeKB });
          }
        }
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

let largeFiles = [];
for (const dir of ASSET_DIRS) {
  largeFiles.push(...findLargeImages(path.resolve(cwd, dir)));
}

if (largeFiles.length === 0) {
  process.exit(0);
}

largeFiles.sort((a, b) => b.sizeKB - a.sizeKB);

process.stdout.write(`[asset-optimization] ${largeFiles.length} image(s) over ${THRESHOLD_KB}KB:\n`);
largeFiles.slice(0, 10).forEach((f) => {
  process.stdout.write(`  - ${f.file} (${f.sizeKB}KB)\n`);
});
if (largeFiles.length > 10) {
  process.stdout.write(`  ... and ${largeFiles.length - 10} more\n`);
}
process.stdout.write('  Consider compressing or converting to WebP format.\n');
process.exit(1);
