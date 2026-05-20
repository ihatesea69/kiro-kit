---
description: Generate a new database migration file with up and down operations
inclusion: manual
argument-hint: "[migration-name] [operation]"
---

## Arguments
NAME: $1 (required, descriptive migration name in kebab-case)
OPERATION: $2 (default: create, options: create, alter, drop, seed, index)

## Workflow
1. Generate timestamped migration file
2. Implement up() function with the schema change
3. Implement down() function to reverse the change
4. Add appropriate indexes based on expected query patterns
5. Include data migration logic if needed
6. Validate migration syntax
7. Test migration against development database
8. Document breaking changes if applicable

## Conventions
- Migrations must be reversible (up and down)
- Never modify a deployed migration
- Use descriptive names: `create-users-table`, `add-email-index`
- Include foreign key constraints where appropriate
- Add created_at/updated_at timestamps to new tables
- Test with production-like data volumes when possible
