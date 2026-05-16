# Skills Directory

Skills extend agent capabilities with specialized knowledge, workflows, or tool integrations.

## Structure

Each skill lives in its own folder with this layout:

```
skills/<skill-name>/
  SKILL.md          - Skill definition with front-matter and instructions
  references/       - Reference documentation files
  scripts/          - Executable scripts the skill uses
  assets/           - Images, templates, or other static assets
```

## Discovery

Skills are discovered by the IDE via the `SKILL.md` file in each folder. The front-matter defines the skill name and when it should activate.

## Sub-skill Containers

A folder without a root `SKILL.md` but containing sub-folders with their own `SKILL.md` files is treated as a sub-skill container. Example:

```
skills/document-skills/
  docx/SKILL.md
  pdf/SKILL.md
  xlsx/SKILL.md
```

## Adding Skills

See `INSTALLATION.md` for instructions on adding new skills to this directory.
