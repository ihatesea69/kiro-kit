# Orchestration Protocol

## Sequential Chaining

Chain agents when tasks have dependencies:
- Planning then Implementation then Testing then Review: for feature development
- Research then Design then Code then Documentation: for new components
- Each agent completes fully before the next begins
- Pass context and outputs between agents in the chain

## Parallel Execution

Spawn multiple agents simultaneously for independent tasks:
- Code + Tests + Docs: when implementing separate, non-conflicting components
- Multiple Feature Branches: different agents working on isolated features
- Infrastructure + Application + Monitoring: parallel work on different layers
- Ensure no file conflicts or shared resource contention
- Plan integration points before parallel execution begins
