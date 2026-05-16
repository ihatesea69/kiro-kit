import path from 'node:path';

/**
 * Normalize a path to use forward slashes (for consistent cross-platform display).
 */
export function normalize(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Get relative path from workspace root, normalized with forward slashes.
 */
export function relativeFromWorkspace(workspaceRoot: string, target: string): string {
  return normalize(path.relative(workspaceRoot, target));
}

/**
 * Check that a resolved path is safely inside the workspace root.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 */
export function safePathInside(workspaceRoot: string, target: string): boolean {
  const resolved = path.resolve(workspaceRoot, target);
  const root = path.resolve(workspaceRoot);
  return resolved.startsWith(root + path.sep) || resolved === root;
}

/**
 * Join paths using OS-native separator.
 */
export function join(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Resolve to absolute path.
 */
export function resolve(...segments: string[]): string {
  return path.resolve(...segments);
}
