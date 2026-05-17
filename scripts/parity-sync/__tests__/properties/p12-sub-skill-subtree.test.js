// Feature: claudekit-parity-sync, Property 12: Sub-skill Subtree Completeness
// **Validates: Requirements 4.2, 4.3, 4.4, 4.13, 13.4**
'use strict';

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.resolve(__dirname, '../../../../presets');

// data-ai preset should have 4 sub-skills under document-skills/
const DATA_AI_SUB_SKILLS = ['docx', 'pdf', 'pptx', 'xlsx'];

describe('Property 12: Sub-skill Subtree Completeness', () => {
  it('data-ai has 4 independent sub-skills under document-skills/ with SKILL.md', () => {
    const arbSubSkill = fc.constantFrom(...DATA_AI_SUB_SKILLS);

    fc.assert(
      fc.property(arbSubSkill, (subSkill) => {
        const subSkillDir = path.join(
          PRESETS_DIR, 'data-ai', 'skills', 'document-skills', subSkill
        );

        // Sub-skill directory must exist
        expect(
          fs.existsSync(subSkillDir),
          `Sub-skill directory missing: skills/document-skills/${subSkill}/`
        ).toBe(true);

        // Must have its own SKILL.md
        const skillMdPath = path.join(subSkillDir, 'SKILL.md');
        expect(
          fs.existsSync(skillMdPath),
          `SKILL.md missing in skills/document-skills/${subSkill}/`
        ).toBe(true);

        // SKILL.md must be non-empty
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        expect(content.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('each data-ai sub-skill is an independent skill entry', () => {
    const manifestPath = path.join(PRESETS_DIR, 'data-ai', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const entries = manifest.files || manifest.entries || [];

    const arbSubSkill = fc.constantFrom(...DATA_AI_SUB_SKILLS);

    fc.assert(
      fc.property(arbSubSkill, (subSkill) => {
        // There should be at least one manifest entry referencing this sub-skill
        const hasEntry = entries.some(
          (e) => e.source && e.source.includes(`document-skills/${subSkill}`)
        );
        expect(
          hasEntry,
          `No manifest entry for sub-skill document-skills/${subSkill}`
        ).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
