import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const STATUSLINE_FILES = ['statusline.js', 'statusline.sh', 'statusline.ps1'];

/**
 * Get the appropriate statusline command for the current platform.
 */
export function getCommand(): string {
  switch (process.platform) {
    case 'win32':
      return 'powershell -ExecutionPolicy Bypass -File .kiro/statusline.ps1';
    default:
      // macOS, Linux, etc.
      return 'node .kiro/statusline.js';
  }
}

/**
 * Install statusline triple (.js, .sh, .ps1) from preset to workspace.
 * Sets chmod +x on .sh for Unix platforms.
 */
export function install(
  presetDir: string,
  workspaceRoot: string,
): string[] {
  const installed: string[] = [];
  const targetDir = path.join(workspaceRoot, '.kiro');
  fs.mkdirSync(targetDir, { recursive: true });

  for (const file of STATUSLINE_FILES) {
    const source = path.join(presetDir, file);
    if (!fs.existsSync(source)) continue;

    const target = path.join(targetDir, file);
    fs.copyFileSync(source, target);
    installed.push(`.kiro/${file}`);

    // Set executable bit on Unix for .sh
    if (file.endsWith('.sh') && process.platform !== 'win32') {
      try {
        fs.chmodSync(target, 0o755);
      } catch {
        // Non-critical: skip if chmod fails
      }
    }
  }

  return installed;
}

/**
 * Resolve the statusLine.command field in settings based on platform.
 */
export function resolveSettingsCommand(settings: Record<string, unknown>): Record<string, unknown> {
  const statusLine = settings['statusLine'] as Record<string, unknown> | undefined;
  if (statusLine && statusLine['type'] === 'command') {
    statusLine['command'] = getCommand();
  }
  return settings;
}
