# Solutions Architect (SA) Preset

A kit for **designing and documenting cloud architectures**: architecture
diagrams (draw.io + Mermaid), architecture documents (Word), architecture decks
(PowerPoint), and infrastructure-as-code (CloudFormation + Terraform), all
reviewed against the AWS Well-Architected Framework.

## Focus Areas

- Architecture diagrams: draw.io with real AWS/Azure/GCP stencils, Mermaid C4/sequence/deployment views
- Architecture deliverables: Solution Architecture Documents (.docx) and review decks (.pptx)
- Infrastructure as code: CloudFormation and Terraform, with lint/policy gates
- AWS Well-Architected reviews (6 pillars) and Architecture Decision Records
- Event-driven, three-tier, data lake, and multi-region DR reference designs

## Prerequisite: `drawio-ai` CLI

The `drawio-aws`, `drawio-azure`, and `drawio-gcp` skills are thin frontends
over the external `drawio-ai` CLI (stencil search + diagram validation). Install
it once, globally:

```bash
npm i -g github:sparklabx/drawio-ai-kit
```

Without it the draw.io skills will stop and ask you to install it — nothing is
installed on your behalf. These skills come from
[sparklabx/drawio-ai-kit](https://github.com/sparklabx/drawio-ai-kit) (MIT);
see `NOTICE` and `skills/THIRD_PARTY_NOTICES.md` for attribution.

Optional extras used by the document/deck skills: `pip install python-pptx python-docx`
and `@mermaid-js/mermaid-cli` (run via `npx`, no install needed).

## Structure

```
sa/
  manifest.json          Preset manifest
  README.md              This file
  NOTICE                 Third-party attribution (drawio-ai-kit, MIT)
  agents/                20 agent definitions
  skills/                27+ skill folders (drawio-aws/azure/gcp, mermaid-diagrams,
                         architecture-deck, architecture-doc, terraform-modules, ...)
  commands/              30+ command files (including iac/ category)
  hooks/                 Cross-platform hook scripts (7 native hooks)
  steering/              Well-Architected, C4, ADR, diagramming, IaC conventions
  workflows/             4 workflow files
  specs/                 4 example architecture specs + templates
  settings.json          Kiro settings (statusLine, hooks)
  statusline.{js,sh,ps1} Statusline scripts
  .mcp.json.example      MCP server config template
  .env.example           Environment variables template
  docs/                  Documentation templates
```

## Example Specs

- `example-three-tier-web-architecture` — VPC + ALB + ECS + RDS Multi-AZ, CloudFormation, Well-Architected review
- `example-event-driven-microservices` — API Gateway + Lambda + EventBridge + SQS/SNS + DynamoDB, Terraform, ADRs
- `example-data-lake-architecture` — S3 tiers + Glue + Athena + Lake Formation, cost/security pillars
- `example-multi-region-dr` — active/passive DR, RTO/RPO, Route 53 failover, game-day drills

## Steering (always-on)

- `aws-well-architected.md` — the 6 pillars and how designs are reviewed against them
- `c4-model.md` — C4 levels and when to use each
- `architecture-decision-records.md` — ADR format and triggers
- `diagramming-conventions.md` — draw.io vs Mermaid, stencil discipline, layout/color rules
- `iac-conventions.md` — CloudFormation vs Terraform, modules, least privilege, state, drift
- `spec-driven-development.md` — the requirements → design → tasks flow

## Minimum Thresholds

- agents: 16
- skills: 22
- commands: 40
- hooks: 6
- workflows: 4

## Recommended Usage

```bash
npx kiro-kit init --preset sa
```

Best suited for:
- Solutions architects producing diagrams, SADs, decks, and IaC
- Design reviews and Well-Architected assessments
- Reference-architecture and proposal work on AWS (with Azure/GCP diagram support)
