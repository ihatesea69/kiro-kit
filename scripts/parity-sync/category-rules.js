/**
 * Category Rules for ClaudeKit Parity Sync (data-only module).
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{requirements,design,tasks}.md
 * Tasks: Phase 1 / 3.1, 3.2 — định nghĩa CATEGORY_RULES khớp 1:1 với
 *        "Bảng phân loại" trong design.md, expose `lookupRule` O(1).
 *
 * Trách nhiệm (design.md > Components and Interfaces > CategoryMapper):
 *   - Cụ thể hoá Req 5 (Category Mapping Table).
 *   - Cho mỗi (artifact_type, identifier), liệt kê target presets trong tập 6
 *     preset chính `{frontend, backend, fullstack, mobile, devops, data-ai}`.
 *   - `_template` KHÔNG xuất hiện trong target_presets (skeleton, không phân
 *     phối tới end-user — Req 2.5).
 *
 * Identifier scheme (`idOf`):
 *   - agent:        ".claude/agents/<basename>.md"     → "<basename>"
 *   - command:      ".claude/commands/<sub/path>.md"   → "<sub/path>"
 *   - skill:        ".claude/skills/<name>(/)?"        → "<name>"
 *   - hook:         ".claude/hooks/<file>"             → "<file>" (giữ ext)
 *   - workflow:     ".claude/workflows/<name>.md"      → "<name>"
 *   - statusline,
 *     settings,
 *     metadata,
 *     mcp_template,
 *     env_example:  ".claude/<rest>"                   → "<rest>"
 *   - docs_template: keep "<.claude|docs>/<rest>" để phân biệt 2 root khác nhau.
 *
 * Pure CommonJS, no I/O at module load. Lookup map được build từ frozen
 * array khi require module — đảm bảo `lookupRule` O(1).
 */

'use strict';

const { normalizeRelPath } = require('./lib/path-utils');

// ---------------------------------------------------------------------------
// Preset subsets (frozen)
// ---------------------------------------------------------------------------

/** @type {ReadonlyArray<string>} Six main user-facing presets (no `_template`). */
const ALL_MAIN_PRESETS = Object.freeze([
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai',
]);

const FRONTEND_LIKE = Object.freeze(['frontend', 'fullstack', 'mobile']);
const FRONTEND_FULLSTACK = Object.freeze(['frontend', 'fullstack']);
const MOBILE_FULLSTACK = Object.freeze(['mobile', 'fullstack']);
const BACKEND_FULLSTACK = Object.freeze(['backend', 'fullstack']);
const BACKEND_FULLSTACK_DEVOPS = Object.freeze(['backend', 'fullstack', 'devops']);
const ALL_EXCEPT_DATA_AI = Object.freeze([
  'frontend', 'backend', 'fullstack', 'mobile', 'devops',
]);
const FRONTEND_FULLSTACK_MOBILE_DEVOPS = Object.freeze([
  'frontend', 'fullstack', 'mobile', 'devops',
]);
const BACKEND_FULLSTACK_DEVOPS_DATA_AI = Object.freeze([
  'backend', 'fullstack', 'devops', 'data-ai',
]);
const FRONTEND_FULLSTACK_MOBILE_DATA_AI = Object.freeze([
  'frontend', 'fullstack', 'mobile', 'data-ai',
]);
const DATA_AI_ONLY = Object.freeze(['data-ai']);
const NO_PRESET = Object.freeze([]); // skip — already-merged or non-applicable

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

function r(artifact_type, basename, target_presets, reason) {
  const out = { artifact_type, basename, target_presets };
  if (reason) out.reason = reason;
  return Object.freeze(out);
}

function many(artifact_type, names, target_presets) {
  return names.map((n) => r(artifact_type, n, target_presets));
}

// ---------------------------------------------------------------------------
// CATEGORY_RULES (133 entries, 1:1 với inventory-source.json)
// ---------------------------------------------------------------------------

const CATEGORY_RULES = Object.freeze([
  // ===== Agents (16 → ALL) ====================================================
  ...many('agent', [
    'brainstormer', 'code-reviewer', 'copywriter', 'database-admin',
    'debugger', 'docs-manager', 'git-manager', 'journal-writer',
    'mcp-manager', 'planner', 'project-manager', 'researcher',
    'scout', 'scout-external', 'tester', 'ui-ux-designer',
  ], ALL_MAIN_PRESETS),

  // ===== Skills (32, mapping per design "Bảng phân loại") =====================
  // Generic core (14, all 6)
  ...many('skill', [
    'ai-multimodal', 'code-review', 'common', 'debugging', 'docs-seeker',
    'mcp-builder', 'mcp-management', 'planning', 'problem-solving', 'repomix',
    'research', 'sequential-thinking', 'skill-creator', 'template-skill',
  ], ALL_MAIN_PRESETS),
  // Frontend-leaning
  ...many('skill', [
    'aesthetic', 'frontend-design', 'frontend-development', 'ui-styling',
  ], FRONTEND_LIKE),
  r('skill', 'threejs', FRONTEND_FULLSTACK),
  r('skill', 'web-frameworks', FRONTEND_FULLSTACK_MOBILE_DEVOPS),
  r('skill', 'chrome-devtools', ALL_EXCEPT_DATA_AI),
  // Backend-leaning
  r('skill', 'backend-development', BACKEND_FULLSTACK_DEVOPS),
  r('skill', 'better-auth', BACKEND_FULLSTACK),
  r('skill', 'databases', BACKEND_FULLSTACK_DEVOPS_DATA_AI),
  r('skill', 'payment-integration', BACKEND_FULLSTACK),
  r('skill', 'shopify', BACKEND_FULLSTACK),
  // DevOps
  r('skill', 'devops', BACKEND_FULLSTACK_DEVOPS),
  // Mobile-leaning (Req 4.7 — primary mobile, fullstack covers cross-platform)
  r('skill', 'mobile-development', MOBILE_FULLSTACK),
  // Data-AI
  r('skill', 'google-adk-python', DATA_AI_ONLY),
  // document-skills là sub-skill container (Req 4.4); cả parent và 4 sub-skill
  // virtual đều ánh xạ sang data-ai để PortPlanner sub-skill-split hợp lệ.
  ...many('skill', [
    'document-skills',
    'document-skills/docx',
    'document-skills/pdf',
    'document-skills/pptx',
    'document-skills/xlsx',
  ], DATA_AI_ONLY),
  // Media (cross-cutting)
  r('skill', 'media-processing', FRONTEND_FULLSTACK_MOBILE_DATA_AI),
  // Docs reference (Req 11.2 — giữ tên skill `claude-code` không rebrand)
  r('skill', 'claude-code', ALL_MAIN_PRESETS),

  // ===== Commands (53) ========================================================
  // Generic + content (47, all 6)
  ...many('command', [
    'ask', 'brainstorm', 'code', 'cook', 'cook/auto', 'cook/auto/fast',
    'debug', 'journal', 'use-mcp', 'watzup',
    'bootstrap', 'bootstrap/auto', 'bootstrap/auto/fast',
    'review/codebase',
    'skill/add', 'skill/create', 'skill/fix-logs', 'skill/optimize',
    'git/cm', 'git/cp', 'git/pr',
    'fix', 'fix/ci', 'fix/fast', 'fix/hard', 'fix/logs', 'fix/test',
    'fix/types', 'fix/ui',
    'plan', 'plan/ci', 'plan/cro', 'plan/fast', 'plan/hard', 'plan/two',
    'scout', 'scout/ext',
    'test',
    'docs/init', 'docs/summarize', 'docs/update',
    'content/cro', 'content/enhance', 'content/fast', 'content/good',
  ], ALL_MAIN_PRESETS),
  // Design (Req 5.6 — frontend, fullstack, mobile)
  ...many('command', [
    'design/3d', 'design/describe', 'design/fast', 'design/good',
    'design/screenshot', 'design/video',
  ], FRONTEND_LIKE),
  // Integrate (Req 5.4 — backend, fullstack)
  ...many('command', ['integrate/polar', 'integrate/sepay'], BACKEND_FULLSTACK),

  // ===== Hooks (7) ============================================================
  r('hook', 'modularization-hook.js', ALL_MAIN_PRESETS),
  r('hook', 'scout-block.js', ALL_MAIN_PRESETS),
  r('hook', 'scout-block.ps1', ALL_MAIN_PRESETS),
  r('hook', 'scout-block.sh', ALL_MAIN_PRESETS),
  // Source-only `.sh` đã được KiroKit hợp nhất vào `discord-notify.{js,sh,ps1}`
  // / `telegram-notify.{js,sh,ps1}` (Req 7.2). Skip ở giai đoạn port.
  r('hook', 'discord_notify.sh', NO_PRESET, 'merged-into-discord-notify-tri-script'),
  r('hook', 'send-discord.sh', NO_PRESET, 'merged-into-discord-notify-tri-script'),
  r('hook', 'telegram_notify.sh', NO_PRESET, 'merged-into-telegram-notify-tri-script'),

  // ===== Workflows (4 → ALL) ==================================================
  ...many('workflow', [
    'development-rules', 'documentation-management',
    'orchestration-protocol', 'primary-workflow',
  ], ALL_MAIN_PRESETS),

  // ===== Statusline (3 → ALL) =================================================
  r('statusline', 'statusline.js', ALL_MAIN_PRESETS),
  r('statusline', 'statusline.ps1', ALL_MAIN_PRESETS),
  r('statusline', 'statusline.sh', ALL_MAIN_PRESETS),

  // ===== Settings / Metadata / MCP (3 singletons → ALL) =======================
  r('settings', 'settings.json', ALL_MAIN_PRESETS),
  r('metadata', 'metadata.json', ALL_MAIN_PRESETS),
  r('mcp_template', '.mcp.json.example', ALL_MAIN_PRESETS),

  // ===== Env examples (3 → ALL) ===============================================
  r('env_example', '.env.example', ALL_MAIN_PRESETS),
  r('env_example', 'hooks/.env.example', ALL_MAIN_PRESETS),
  r('env_example', 'skills/.env.example', ALL_MAIN_PRESETS),

  // ===== Docs templates (12 → ALL) ============================================
  // Hook-/skill-related docs sống trong preset/{hooks,skills}/.
  ...many('docs_template', [
    '.claude/hooks/discord-hook-setup.md',
    '.claude/hooks/README.md',
    '.claude/hooks/telegram-hook-setup.md',
    '.claude/skills/agent_skills_spec.md',
    '.claude/skills/INSTALLATION.md',
    '.claude/skills/README.md',
    '.claude/skills/THIRD_PARTY_NOTICES.md',
  ], ALL_MAIN_PRESETS),
  // Project-level docs templates (Req 10.x); PortPlanner quyết định đích thực.
  ...many('docs_template', [
    'docs/code-standards.md',
    'docs/codebase-summary.md',
    'docs/project-overview-pdr.md',
    'docs/project-roadmap.md',
    'docs/system-architecture.md',
  ], ALL_MAIN_PRESETS),
]);

// ---------------------------------------------------------------------------
// Lookup index (built once at require-time; O(1) lookup)
// ---------------------------------------------------------------------------

const INDEX = (() => {
  const m = new Map();
  for (const rule of CATEGORY_RULES) {
    const key = rule.artifact_type + '\0' + rule.basename;
    if (m.has(key)) {
      // Defensive: duplicate rules would silently shadow; surface as load-time
      // error so maintainer fixes the table immediately.
      throw new Error(
        `Duplicate CATEGORY_RULES entry for (${rule.artifact_type}, ${rule.basename})`,
      );
    }
    m.set(key, rule);
  }
  return m;
})();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * O(1) lookup. Match is case-sensitive on both `artifactType` và `basename`.
 *
 * @param {string} artifactType e.g. 'agent', 'skill', 'command'.
 * @param {string} basename Canonical id (xem `idOf`).
 * @returns {ReadonlyArray<string> | null} Frozen target_presets array,
 *          hoặc `null` nếu không có rule. Empty array `[]` nghĩa là rule có
 *          nhưng artifact KHÔNG được port vào preset nào (skip).
 */
function lookupRule(artifactType, basename) {
  if (typeof artifactType !== 'string' || typeof basename !== 'string') {
    return null;
  }
  const rule = INDEX.get(artifactType + '\0' + basename);
  return rule ? rule.target_presets : null;
}

/**
 * Helper cho category-mapper: kiểm tra preset có nằm trong target_presets.
 *
 * @param {ReadonlyArray<string> | null | undefined} presets
 * @param {string} presetName
 * @returns {boolean}
 */
function presetMatches(presets, presetName) {
  if (!Array.isArray(presets)) return false;
  return presets.includes(presetName);
}

/**
 * Derive canonical lookup key cho một SourceItem.
 *
 * @param {{ artifact_type: string, path: string }} item
 * @returns {string | null} Returns `null` nếu path không khớp pattern artifact_type.
 */
function idOf(item) {
  if (!item || typeof item.path !== 'string' || typeof item.artifact_type !== 'string') {
    return null;
  }
  let p;
  try {
    p = normalizeRelPath(item.path);
  } catch (_e) {
    return null;
  }
  // Strip outer wrapper "claudekit-engineer-main/" — leaves ".claude/..." or "docs/...".
  const ENGINEER = 'claudekit-engineer-main/';
  if (p.startsWith(ENGINEER)) p = p.slice(ENGINEER.length);

  switch (item.artifact_type) {
    case 'agent': {
      const m = /^\.claude\/agents\/(.+)\.md$/.exec(p);
      return m ? m[1] : null;
    }
    case 'command': {
      const m = /^\.claude\/commands\/(.+)\.md$/.exec(p);
      return m ? m[1] : null;
    }
    case 'skill': {
      const m = /^\.claude\/skills\/(.+?)\/?$/.exec(p);
      return m ? m[1] : null;
    }
    case 'hook': {
      const m = /^\.claude\/hooks\/(.+)$/.exec(p);
      return m ? m[1] : null;
    }
    case 'workflow': {
      const m = /^\.claude\/workflows\/(.+)\.md$/.exec(p);
      return m ? m[1] : null;
    }
    case 'statusline':
    case 'settings':
    case 'metadata':
    case 'mcp_template':
    case 'env_example': {
      const m = /^\.claude\/(.+)$/.exec(p);
      return m ? m[1] : null;
    }
    case 'docs_template':
      // Giữ root prefix (".claude/..." vs "docs/...") để tránh đụng key.
      return p;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  CATEGORY_RULES,
  ALL_MAIN_PRESETS,
  lookupRule,
  presetMatches,
  idOf,
};
