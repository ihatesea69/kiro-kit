# Mutation Testing Guide

## Concept

1. Introduce small code changes (mutants)
2. Run test suite against each mutant
3. If tests fail: mutant killed (good)
4. If tests pass: mutant survived (weak tests)

## Common Mutations

- Arithmetic: + to -, * to /
- Conditional: > to >=, == to !=
- Boolean: true to false, && to ||
- Return: return value to null/0/empty
- Removal: delete statements

## Tools

- Stryker (JavaScript/TypeScript)
- PIT (Java)
- mutmut (Python)

## Metrics

- Mutation Score: killed / total mutants
- Target: 80%+ for critical business logic
- Focus on: boundary conditions, error handling

## Best Practices

- Run on critical business logic first
- Use incremental mode for fast feedback
- Set thresholds in CI quality gates
- Focus on surviving mutants near changed code
