---
description: Run a 6-pillar AWS Well-Architected review against a design or IaC directory
inclusion: manual
argument-hint: "[target] [pillar]"
---

## Arguments
TARGET: $1 (default: the active spec's design.md; may be a path to design.md or an infra/ directory)
PILLAR: $2 (default: all, options: operational-excellence, security, reliability, performance, cost, sustainability)

## Workflow
1. Read the target design and any IaC under infra/; identify the workload's components, data stores, and network boundaries
2. Evaluate each requested pillar per the `aws-well-architected` steering — findings must reference concrete resources/templates, not intentions
3. For security and cost, corroborate with tooling where available (checkov/cfn_nag scan results, Infracost or a manual cost-driver table)
4. Produce a review table: pillar | finding | severity (info/low/med/high) | remediation, and write/refresh the "Well-Architected Review" section of the target design.md
5. Flag any high-severity finding as an approval-gate blocker and propose the ADR(s) needed for accepted trade-offs (see `architecture-decision-records` steering)
