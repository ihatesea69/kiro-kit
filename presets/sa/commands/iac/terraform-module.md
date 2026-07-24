---
description: Scaffold, validate, and document reusable Terraform modules
inclusion: manual
argument-hint: "[action] [module-name]"
---

## Arguments
ACTION: $1 (required, options: scaffold, validate, document, test)
MODULE: $2 (required for scaffold; default: infer from infra/terraform/modules/)

## Workflow
1. If scaffold: create `infra/terraform/modules/<name>/` with main.tf, variables.tf (typed + described + validated), outputs.tf, README.md, and a minimal example under examples/; no provider blocks inside the module (see `iac-conventions` steering)
2. If validate: run `terraform fmt -check`, `terraform validate`, `tflint`, and `checkov` against the module and its examples; report findings by severity
3. If document: generate/update README input-output tables with `terraform-docs markdown table`
4. If test: run `terraform plan` against the example configuration (or `terraform test` if test files exist) and summarize the plan diff
5. Confirm version pins (`required_version`, `required_providers` with `~>`) and prevent_destroy on stateful resources before reporting done
