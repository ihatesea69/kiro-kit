---
description: Author, lint, and manage CloudFormation stacks (scaffold, lint, deploy, drift)
inclusion: manual
argument-hint: "[action] [stack-name]"
---

## Arguments
ACTION: $1 (required, options: scaffold, lint, deploy, drift, delete)
STACK: $2 (default: infer from infra/cloudformation/ layout)

## Workflow
1. If scaffold: create the stack layout per `iac-conventions` steering (network/compute/data split, params per env), with DeletionPolicy Retain on stateful resources and encryption enabled by default
2. If lint: run `cfn-lint` and `checkov` on all templates; report findings by severity
3. If deploy: create a change set (`aws cloudformation deploy --no-execute-changeset` or `rain deploy`), show the change set for review, execute only after confirmation
4. If drift: run drift detection on the stack and summarize drifted resources with remediation steps
5. If delete: verify termination protection and DeletionPolicy on stateful resources, then require explicit confirmation before deleting
6. Always finish with a Well-Architected note for anything newly introduced (see `aws-well-architected` steering)
