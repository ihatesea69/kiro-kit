# Specs Workflow

## Overview

Specs are a structured way of building and documenting features. A spec formalizes the design and implementation process through requirements, design, and implementation tasks.

## Spec Types

### Feature Spec
- Requirements -> Design -> Tasks (requirements-first)
- Design -> Requirements -> Tasks (design-first)

### Bugfix Spec
- Bug condition methodology
- Exploration tests to confirm bug exists
- Fix implementation with property-based testing

## File Structure

```
.kiro/specs/{feature-name}/
  requirements.md    # User stories and acceptance criteria
  design.md          # Technical design document
  tasks.md           # Implementation task list
```

## Workflow

1. **Start a spec**: Tell Kiro you want to build a feature
2. **Choose approach**: Requirements-first or Design-first
3. **Iterate on documents**: Review and refine with Kiro
4. **Execute tasks**: Kiro implements tasks sequentially
5. **Validate**: Tests verify correctness

## Requirements Document

Contains:
- User stories with acceptance criteria
- Correctness properties (formal specifications)
- Constraints and assumptions

## Design Document

Contains:
- High-level architecture
- Data models and schemas
- API contracts
- Component interactions

## Tasks Document

Contains:
- Ordered implementation tasks
- Sub-tasks with checkboxes
- Dependencies between tasks

## Property-Based Testing

Specs encourage formal correctness properties:
- Define what "correct" means for your feature
- Encode properties as executable tests
- Use property-based testing frameworks (fast-check, hypothesis)
