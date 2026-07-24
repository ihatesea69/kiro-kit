---
inclusion: always
description: CloudFormation vs Terraform choice, module structure, least-privilege IAM, state management, and drift control for IaC produced in this workspace.
---

# Infrastructure-as-Code Conventions

## CloudFormation vs Terraform

| Situation | Use |
|-----------|-----|
| AWS-only, org standardised on AWS tooling, StackSets across accounts | CloudFormation (`infra/cloudformation/`) |
| Multi-cloud, existing TF estate, rich module reuse, plan-time policy tools | Terraform (`infra/terraform/`) |
| Both viable | Follow the team's existing estate; record the choice as an ADR |

One tool per stack boundary — never manage the same resource from both.

## Layout

**CloudFormation** — nested or split stacks by lifecycle:

```
infra/cloudformation/
  main.yaml            # root/orchestration stack
  network.yaml         # VPC, subnets, routing (slow-changing)
  compute.yaml         # services, scaling (fast-changing)
  data.yaml            # databases, buckets (stateful — protect)
  params/{dev,staging,prod}.json
```

**Terraform** — composable modules, thin environment roots:

```
infra/terraform/
  modules/<name>/      # main.tf, variables.tf, outputs.tf, README.md
  envs/{dev,staging,prod}/  # backend.tf, main.tf (module calls), terraform.tfvars
```

- Modules expose variables with types + descriptions + validation; no
  provider blocks inside reusable modules.
- Pin versions: provider `required_version`/`required_providers` with `~>`;
  module sources by exact tag.

## Least Privilege

- No `Action: "*"` or `Resource: "*"` in production IAM; scope to ARNs and
  condition keys.
- Deployment roles are scoped per stack (what this stack manages, nothing
  more); humans assume read-only by default.
- Data stores get resource policies (bucket policies, KMS key policies) in the
  same template as the resource — encryption on by default.
- Lint policies: `cfn-lint` + `cfn_nag`/`checkov` (CFN), `tflint` + `checkov`
  (TF) run in CI on every PR.

## State & Stateful Resources

- Terraform state: remote backend only (S3 + DynamoDB lock table, or Terraform
  Cloud); state is sensitive — encrypt, never commit, never edit by hand.
- One state per environment; cross-stack reads via outputs/data sources, not
  shared state files.
- Protect stateful resources: `DeletionPolicy: Retain` + stack termination
  protection (CFN), `prevent_destroy` lifecycle (TF) on databases and buckets.

## Drift

- Drift is an incident, not a fact of life: no console changes in prod — break
  glass requires a follow-up PR that reconciles code.
- Detect on schedule: CloudFormation drift detection / `terraform plan
  -detailed-exitcode` in a nightly job; non-empty diff pages the owning team.
- `terraform import`/resource import brings unmanaged resources under IaC;
  deleting from code is the only sanctioned way to delete infrastructure.

## Reviews

Every IaC change ships with: plan/change-set output attached to the PR, lint
green, cost delta noted (Infracost or manual estimate), and — for new stacks —
a Well-Architected review (see `aws-well-architected` steering).
