# Orchestration Protocol

## Sequential Chaining

Chain tasks when they have dependencies or require outputs from previous steps:

- Planning then Implementation then Testing then Review: feature development
- Research then Design then Code then Documentation: new system components
- Each step completes fully before the next begins
- Pass context and outputs between steps in the chain

## Parallel Execution

Execute multiple tasks simultaneously when they are independent:

- Code + Tests + Docs: when implementing separate non-conflicting components
- Multiple feature branches: different work on isolated features
- Cross-platform builds: platform-specific implementations

## Coordination Rules

- Ensure no file conflicts or shared resource contention in parallel work
- Plan integration points before parallel execution begins
- Use merge strategy to combine parallel outputs
- Validate combined results after parallel work completes
