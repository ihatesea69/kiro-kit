#!/usr/bin/env node
/**
 * Reminds to update model card when model files (.pkl, .pt, .h5, saved_model/)
 * are modified.
 */

const fs = require('fs');
const path = require('path');

const MODEL_DIRS = ['models', 'src/models', 'artifacts', 'saved_models'];
const MODEL_EXTENSIONS = ['.pkl', '.pt', '.pth', '.h5', '.onnx', '.pb', '.safetensors'];
const MODEL_CARD_NAMES = ['MODEL_CARD.md', 'model_card.md', 'model-card.md', 'README.md'];

const cwd = process.cwd();

function findModelFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '__pycache__') {
        // saved_model/ directories count as model artifacts
        if (entry.name === 'saved_model' || entry.name === 'checkpoint') {
          results.push(full);
        } else {
          results.push(...findModelFiles(full));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (MODEL_EXTENSIONS.includes(ext)) {
          results.push(full);
        }
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

let modelFiles = [];
for (const dir of MODEL_DIRS) {
  modelFiles.push(...findModelFiles(path.resolve(cwd, dir)));
}

if (modelFiles.length === 0) {
  process.exit(0);
}

// Check if model card exists
let modelCardPath = null;
for (const dir of MODEL_DIRS) {
  for (const name of MODEL_CARD_NAMES) {
    const full = path.resolve(cwd, dir, name);
    if (fs.existsSync(full)) {
      modelCardPath = full;
      break;
    }
  }
  if (modelCardPath) break;
}

// Also check project root
if (!modelCardPath) {
  for (const name of MODEL_CARD_NAMES.slice(0, -1)) {
    const full = path.resolve(cwd, name);
    if (fs.existsSync(full)) {
      modelCardPath = full;
      break;
    }
  }
}

if (!modelCardPath) {
  process.stdout.write(
    '[model-card-update] Model artifacts found but no model card exists.\n' +
    '  Create a MODEL_CARD.md documenting model details, metrics, and limitations.\n'
  );
  process.exit(1);
}

// Check if model files are newer than model card
const cardStat = fs.statSync(modelCardPath);
const newerModels = modelFiles.filter((f) => {
  try {
    const stat = fs.statSync(f);
    return stat.mtimeMs > cardStat.mtimeMs;
  } catch (e) { return false; }
});

if (newerModels.length > 0) {
  process.stdout.write(
    `[model-card-update] ${newerModels.length} model file(s) updated after model card.\n` +
    `  Update ${path.relative(cwd, modelCardPath)} with latest model information.\n`
  );
  process.exit(1);
}

process.exit(0);
