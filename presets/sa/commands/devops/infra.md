---
description: Manage infrastructure with Terraform (plan, apply, destroy)
inclusion: manual
argument-hint: "[action] [environment]"
---

## Arguments
ACTION: $1 (required, options: plan, apply, destroy, import, state)
ENVIRONMENT: $2 (default: dev)

## Workflow
1. Select workspace/directory for target environment
2. Run `terraform init` if needed
3. If plan: run `terraform plan` and show resource changes
4. If apply: run `terraform apply` with plan file
5. If destroy: require explicit confirmation before proceeding
6. Report resource changes and any drift detected
