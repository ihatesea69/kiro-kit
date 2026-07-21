/**
 * Structured error class for kiro-kit CLI.
 * Each error carries a unique code (KK001-KK091), a human-readable message,
 * and an optional suggestion for resolution.
 */
export class KKError extends Error {
  readonly code: string;
  readonly suggestion?: string;

  constructor(code: string, message: string, suggestion?: string) {
    super(message);
    this.name = 'KKError';
    this.code = code;
    this.suggestion = suggestion;
    Object.setPrototypeOf(this, KKError.prototype);
  }

  format(): string {
    let output = `[${this.code}] ${this.message}`;
    if (this.suggestion) {
      output += `\n  Suggestion: ${this.suggestion}`;
    }
    return output;
  }
}

// Common error codes
export const ErrorCodes = {
  NODE_VERSION: 'KK001',
  MANIFEST_INVALID: 'KK010',
  MANIFEST_MISSING_FIELD: 'KK011',
  MANIFEST_ORPHAN_FILE: 'KK012',
  MANIFEST_INCOMPLETE: 'KK013',
  PRESET_NOT_FOUND: 'KK020',
  PRESET_LOAD_FAILED: 'KK021',
  CONFLICT_UNRESOLVED: 'KK030',
  TRACKING_CORRUPT: 'KK040',
  TRACKING_WRITE_FAILED: 'KK041',
  BACKUP_NOT_FOUND: 'KK050',
  BACKUP_WRITE_FAILED: 'KK051',
  MCP_MERGE_CONFLICT: 'KK060',
  MCP_INVALID_JSON: 'KK061',
  SETTINGS_MERGE_WARN: 'KK070',
  FRONTMATTER_INVALID: 'KK080',
  FRONTMATTER_MISSING: 'KK081',
  DOCTOR_FAIL: 'KK090',
  DOCTOR_WARN: 'KK091',
  SPEC_INVALID_TEMPLATE: 'KK100',
} as const;
