/**
 * Unit test: PortPlanner — sub-skill-split + tri-script-extend.
 *
 * Spec: .kiro/specs/claudekit-parity-sync/{design,tasks}.md
 * Task: tasks.md > 6.7 — fixture sub-skill → 4 PortPlan; fixture .sh hook →
 *       tri-script-extend đúng.
 *
 * Two scenarios (per task 6.7 brief):
 *   1. Sub-skill fixture: SourceItem cho `document-skills` container với
 *      `extras.is_sub_skill_container: true` và `extras.subdirs:
 *      ['docx','pdf','pptx','xlsx']`. Delta status='missing' cho preset
 *      'data-ai'. Run `plan()` → assert đúng 4 PortPlan, mỗi plan có
 *      transforms chứa 'sub-skill-split'.
 *
 *   2. Tri-script-extend fixture: SourceItem `discord_notify.sh`
 *      (artifact_type='hook'). Delta status='missing' cho preset 'backend'
 *      (bypass real CATEGORY_RULES — production sẽ trả NO_PRESET, nhưng
 *      đây là unit test isolated). Assert PortPlan có transform
 *      'tri-script-extend' và target_paths bao gồm cả `.sh`, `.js`, `.ps1`.
 *
 * Bonus assertions để bảo vệ regression:
 *   - `transformsFor` trả mảng mới mỗi lần gọi (không cache).
 *   - Plan skip với status 'present' / 'category-skip'.
 *   - Json-merge và env-merge transforms được set đúng cho settings.json /
 *     .env.example.
 *   - Frontmatter-keep được set cho agent .md.
 */

'use strict';

const { plan, transformsFor } = require('../../port-planner');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a synthetic DeltaEntry. Bypasses DeltaDetector / CategoryMapper to
 * keep this unit test isolated.
 *
 * @param {object} src SourceItem.
 * @param {string} preset Target preset name.
 * @param {'missing'|'partial'|'present'|'category-skip'} status
 * @returns {object}
 */
function buildDelta(src, preset, status) {
  const PREFIX = 'claudekit-engineer-main/.claude/';
  const sourcePath = src.path.startsWith(PREFIX)
    ? src.path.slice(PREFIX.length)
    : src.path;

  // Strip trailing slash for joinPath; preserve directory semantic with
  // explicit trailing slash on target_path when source is folder.
  const isDir = sourcePath.endsWith('/');
  const cleaned = sourcePath.replace(/\/+$/, '');
  const targetBase = `presets/${preset}/${cleaned}`;
  const targetPath = isDir ? `${targetBase}/` : targetBase;

  return {
    source_id: src.id,
    source_path: sourcePath,
    target_preset: preset,
    target_path: targetPath,
    status,
    source_lines: src.size_lines || 0,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Sub-skill split fixture
// ---------------------------------------------------------------------------

describe('PortPlanner — sub-skill-split (task 6.7)', () => {
  /** @type {object} */
  const documentSkillsSrc = {
    id: 'src.skill.document-skills',
    kit: 'source',
    preset: null,
    artifact_type: 'skill',
    path: 'claudekit-engineer-main/.claude/skills/document-skills/',
    basename: 'document-skills',
    size_lines: 0,
    front_matter: { present: false, fields: null },
    extras: {
      is_sub_skill_container: true,
      subdirs: ['docx', 'pdf', 'pptx', 'xlsx'],
      cross_platform_group: null,
      skill_md_path: null,
    },
  };

  it('emits exactly 4 PortPlans (one per subdir) for data-ai preset', () => {
    const delta = buildDelta(documentSkillsSrc, 'data-ai', 'missing');
    const plans = plan([delta], [documentSkillsSrc]);

    expect(plans).toHaveLength(4);
  });

  it('each emitted plan has transforms containing "sub-skill-split"', () => {
    const delta = buildDelta(documentSkillsSrc, 'data-ai', 'missing');
    const plans = plan([delta], [documentSkillsSrc]);

    for (const p of plans) {
      expect(p.transforms).toContain('sub-skill-split');
      // Skill folder cũng ngầm có rebrand + frontmatter-keep theo design.
      expect(p.transforms).toContain('rebrand');
      expect(p.transforms).toContain('frontmatter-keep');
    }
  });

  it('source_path/target_paths cover all 4 subdirs in order', () => {
    const delta = buildDelta(documentSkillsSrc, 'data-ai', 'missing');
    const plans = plan([delta], [documentSkillsSrc]);

    const expectedSubdirs = ['docx', 'pdf', 'pptx', 'xlsx'];
    for (let i = 0; i < expectedSubdirs.length; i++) {
      const sd = expectedSubdirs[i];
      expect(plans[i].source_path).toBe(`skills/document-skills/${sd}/`);
      expect(plans[i].target_paths).toEqual([
        `presets/data-ai/skills/document-skills/${sd}/`,
      ]);
      expect(plans[i].artifact_type).toBe('skill');
      expect(plans[i].target_preset).toBe('data-ai');
      expect(plans[i].source_id).toBe('src.skill.document-skills');
    }
  });

  it('container without subdirs falls back to a single plan (defensive)', () => {
    const malformed = {
      ...documentSkillsSrc,
      id: 'src.skill.empty-container',
      extras: {
        ...documentSkillsSrc.extras,
        subdirs: [],
      },
    };
    const delta = buildDelta(malformed, 'data-ai', 'missing');
    const plans = plan([delta], [malformed]);
    expect(plans).toHaveLength(1);
    expect(plans[0].transforms).toContain('sub-skill-split');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Tri-script-extend fixture
// ---------------------------------------------------------------------------

describe('PortPlanner — tri-script-extend (task 6.7)', () => {
  /** @type {object} */
  const discordShSrc = {
    id: 'src.hook.discord_notify.sh',
    kit: 'source',
    preset: null,
    artifact_type: 'hook',
    path: 'claudekit-engineer-main/.claude/hooks/discord_notify.sh',
    basename: 'discord_notify',
    size_lines: 221,
    front_matter: { present: false, fields: null },
    extras: {
      is_sub_skill_container: false,
      subdirs: [],
      cross_platform_group: null,
    },
  };

  it('emits a single PortPlan with tri-script-extend transform', () => {
    // Note: production CATEGORY_RULES returns NO_PRESET cho discord_notify.sh
    // (Req 7.2 — đã merge), nhưng unit test bypass CategoryMapper bằng cách
    // feed delta direct. Planner phải xử lý đúng nếu delta vẫn lọt qua.
    const delta = buildDelta(discordShSrc, 'backend', 'missing');
    const plans = plan([delta], [discordShSrc]);

    expect(plans).toHaveLength(1);
    expect(plans[0].transforms).toContain('tri-script-extend');
    // Hook `.sh` cũng được rebrand (text file).
    expect(plans[0].transforms).toContain('rebrand');
  });

  it('target_paths includes .sh, .js, and .ps1 variants (in that order)', () => {
    const delta = buildDelta(discordShSrc, 'backend', 'missing');
    const plans = plan([delta], [discordShSrc]);

    expect(plans[0].target_paths).toEqual([
      'presets/backend/hooks/discord_notify.sh',
      'presets/backend/hooks/discord_notify.js',
      'presets/backend/hooks/discord_notify.ps1',
    ]);
  });

  it('preserves source_path, artifact_type, target_preset, source_id pass-through', () => {
    const delta = buildDelta(discordShSrc, 'backend', 'missing');
    const plans = plan([delta], [discordShSrc]);

    expect(plans[0].source_path).toBe('hooks/discord_notify.sh');
    expect(plans[0].artifact_type).toBe('hook');
    expect(plans[0].target_preset).toBe('backend');
    expect(plans[0].source_id).toBe('src.hook.discord_notify.sh');
  });

  it('does NOT trigger tri-script-extend for hook in cross_platform_group (already tri-script)', () => {
    const scoutBlockSh = {
      id: 'src.hook.scout-block.sh',
      kit: 'source',
      preset: null,
      artifact_type: 'hook',
      path: 'claudekit-engineer-main/.claude/hooks/scout-block.sh',
      basename: 'scout-block',
      size_lines: 51,
      extras: {
        is_sub_skill_container: false,
        subdirs: [],
        cross_platform_group: 'scout-block',
      },
    };
    const delta = buildDelta(scoutBlockSh, 'frontend', 'missing');
    const plans = plan([delta], [scoutBlockSh]);

    expect(plans).toHaveLength(1);
    expect(plans[0].transforms).not.toContain('tri-script-extend');
    expect(plans[0].target_paths).toEqual([
      'presets/frontend/hooks/scout-block.sh',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Bonus: skip rules & misc transforms
// ---------------------------------------------------------------------------

describe('PortPlanner — skip rules', () => {
  const agentSrc = {
    id: 'src.agent.brainstormer',
    kit: 'source',
    artifact_type: 'agent',
    path: 'claudekit-engineer-main/.claude/agents/brainstormer.md',
    basename: 'brainstormer',
    size_lines: 50,
    front_matter: { present: true, fields: { name: 'brainstormer' } },
    extras: { is_sub_skill_container: false, subdirs: [] },
  };

  it('skips deltas with status "present"', () => {
    const delta = buildDelta(agentSrc, 'frontend', 'present');
    const plans = plan([delta], [agentSrc]);
    expect(plans).toHaveLength(0);
  });

  it('skips deltas with status "category-skip"', () => {
    const delta = buildDelta(agentSrc, 'frontend', 'category-skip');
    const plans = plan([delta], [agentSrc]);
    expect(plans).toHaveLength(0);
  });

  it('emits plan for "missing"', () => {
    const delta = buildDelta(agentSrc, 'frontend', 'missing');
    const plans = plan([delta], [agentSrc]);
    expect(plans).toHaveLength(1);
  });

  it('emits plan for "partial"', () => {
    const delta = buildDelta(agentSrc, 'frontend', 'partial');
    const plans = plan([delta], [agentSrc]);
    expect(plans).toHaveLength(1);
  });
});

describe('PortPlanner — frontmatter-keep / json-merge / env-merge transforms', () => {
  it('agent .md → frontmatter-keep + rebrand', () => {
    const agent = {
      id: 'src.agent.planner',
      artifact_type: 'agent',
      path: 'claudekit-engineer-main/.claude/agents/planner.md',
      front_matter: { present: true, fields: { name: 'planner' } },
      size_lines: 80,
    };
    expect(transformsFor(agent)).toEqual(['rebrand', 'frontmatter-keep']);
  });

  it('settings.json → rebrand + json-merge (no frontmatter)', () => {
    const settings = {
      id: 'src.settings.settings.json',
      artifact_type: 'settings',
      path: 'claudekit-engineer-main/.claude/settings.json',
      size_lines: 30,
    };
    const t = transformsFor(settings);
    expect(t).toContain('rebrand');
    expect(t).toContain('json-merge');
    expect(t).not.toContain('frontmatter-keep');
  });

  it('metadata.json → json-merge', () => {
    const meta = {
      id: 'src.metadata.metadata.json',
      artifact_type: 'metadata',
      path: 'claudekit-engineer-main/.claude/metadata.json',
      size_lines: 12,
    };
    expect(transformsFor(meta)).toContain('json-merge');
  });

  it('.mcp.json.example → json-merge', () => {
    const mcp = {
      id: 'src.mcp.mcp.json.example',
      artifact_type: 'mcp_template',
      path: 'claudekit-engineer-main/.claude/.mcp.json.example',
      size_lines: 20,
    };
    expect(transformsFor(mcp)).toContain('json-merge');
  });

  it('.env.example (root) → env-merge', () => {
    const env = {
      id: 'src.env.env',
      artifact_type: 'env_example',
      path: 'claudekit-engineer-main/.claude/.env.example',
      size_lines: 5,
    };
    expect(transformsFor(env)).toContain('env-merge');
  });

  it('hooks/.env.example → env-merge', () => {
    const env = {
      id: 'src.env.hooks.env',
      artifact_type: 'env_example',
      path: 'claudekit-engineer-main/.claude/hooks/.env.example',
      size_lines: 8,
    };
    expect(transformsFor(env)).toContain('env-merge');
  });

  it('returns a fresh array each call (not cached)', () => {
    const item = {
      id: 'x',
      artifact_type: 'agent',
      path: 'claudekit-engineer-main/.claude/agents/x.md',
      front_matter: { present: true, fields: {} },
    };
    const a = transformsFor(item);
    const b = transformsFor(item);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('returns empty array for null/invalid input (defensive)', () => {
    expect(transformsFor(null)).toEqual([]);
    expect(transformsFor(undefined)).toEqual([]);
    expect(transformsFor({})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Plan input validation
// ---------------------------------------------------------------------------

describe('PortPlanner — input validation', () => {
  it('throws TypeError when deltas is not array', () => {
    expect(() => plan(null, [])).toThrow(TypeError);
    expect(() => plan({}, [])).toThrow(TypeError);
  });

  it('throws TypeError when sourceItems is not array', () => {
    expect(() => plan([], null)).toThrow(TypeError);
    expect(() => plan([], 'foo')).toThrow(TypeError);
  });

  it('returns empty array when both inputs are empty', () => {
    expect(plan([], [])).toEqual([]);
  });

  it('skips deltas whose source_id is not found in sourceItems', () => {
    const orphan = {
      source_id: 'unknown.id',
      source_path: 'agents/x.md',
      target_preset: 'frontend',
      target_path: 'presets/frontend/agents/x.md',
      status: 'missing',
      source_lines: 0,
    };
    expect(plan([orphan], [])).toEqual([]);
  });
});
