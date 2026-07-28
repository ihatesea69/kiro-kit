# AI Engineer Preset

A kit for **building production chatbots and AI agents on AWS** — agents on
Amazon Bedrock AgentCore, MCP server hosting, open-source agent frameworks, and
the RAG, guardrail, and evaluation machinery that turns a demo into a product.

## Focus Areas

- **Agents on AgentCore**: Runtime, Gateway, Memory, Identity, Observability — and when to use Harness or plain Lambda instead
- **MCP**: hosting remote MCP servers on AWS, turning Lambdas and APIs into MCP tools, OAuth (2LO/3LO), semantic tool discovery
- **Frameworks**: Strands Agents as the default; LangGraph, CrewAI, LlamaIndex, and Google ADK all run on AgentCore Runtime
- **RAG**: Bedrock Knowledge Bases — chunking, hybrid retrieval, verified citations, contextual grounding
- **Evaluation**: golden sets, deterministic tool-selection checks, LLM-as-a-Judge, CI gates, online drift alarms
- **Responsible AI**: Guardrails on input and output, prompt-injection defence, PII handling, hard cost caps

## How This Differs From `data-ai`

`data-ai` is an ML and data-science toolkit — PyTorch, TensorFlow, pandas,
experiment tracking, MLOps. `ai-engineer` is the **application-engineering**
preset: shipping agents and chatbots to production on AWS. Different audience,
different workflow. The two overlap only on the AI-adjacent skills
(`mcp-builder`, `google-adk-python`, `ai-multimodal`, `research`).

## Structure

```
ai-engineer/
  manifest.json          Preset manifest
  README.md              This file
  agents/                20 agent definitions
  skills/                35 skill folders (bedrock-agentcore, agentcore-gateway-mcp,
                         mcp-server-hosting, strands-agents, bedrock-rag,
                         agent-evaluation, mcp-builder, ...)
  commands/              40+ command files
  hooks/                 Cross-platform hook scripts (7 native .kiro.hook files)
  steering/              AWS-native agents, MCP architecture, agent design patterns,
                         agent evaluation, responsible AI, spec-driven development
  workflows/             4 workflow files
  specs/                 4 example agent specs + templates
  settings.json          Kiro settings (statusLine, hooks)
  statusline.{js,sh,ps1} Statusline scripts
  .mcp.json.example      MCP server config template
  .env.example           Environment variables template
  docs/                  Documentation templates
```

## Specialised Skills

| Skill | What it covers |
|-------|----------------|
| `bedrock-agentcore` | Runtime deployment, Harness vs Runtime vs Lambda, Memory tiers, the `0.0.0.0:8000/mcp` contract |
| `agentcore-gateway-mcp` | Lambda/OpenAPI/Smithy → MCP tools, four outbound auth modes, the SigV4 matrix, the `DYNAMIC`-mode gotcha |
| `mcp-server-hosting` | Remote MCP servers on Lambda/Fargate/Runtime, OAuth via Cognito/Okta/Auth0, the 401 + `WWW-Authenticate` handshake |
| `strands-agents` | The default framework: model-driven tool loop, MCP clients, multi-agent, streaming, hooks |
| `bedrock-rag` | Knowledge Bases, chunking, hybrid search, citation verification, contextual grounding |
| `agent-evaluation` | Golden sets, deterministic checks, LLM-as-a-Judge, CI thresholds, drift monitoring |

## Example Specs

- `example-agentcore-support-chatbot` — Strands agent on AgentCore Runtime with Memory, a Gateway MCP tool, and Guardrails
- `example-mcp-server-on-lambda` — OAuth-protected remote MCP server on Lambda, registered as a Gateway target via 2LO
- `example-rag-knowledge-assistant` — RAG over Bedrock Knowledge Bases with evaluation gates
- `example-multi-agent-orchestrator` — supervisor/worker agents over A2A on AgentCore Runtime

## Usage

```bash
npx kiro-kit init --preset ai-engineer
```

## MCP Servers

- `filesystem` — local file access
- `git` — repository operations
- `fetch` — HTTP fetching
- `context7` — up-to-date SDK documentation
- `memory` — persistent context
- `sequentialthinking` — structured decomposition

## Recommended Stack

- Python 3.11+
- Strands Agents SDK (default), or LangGraph / CrewAI / LlamaIndex / Google ADK
- Amazon Bedrock AgentCore (Runtime, Gateway, Memory)
- MCP Python SDK, streamable-HTTP transport
- Amazon Bedrock Knowledge Bases + Guardrails
- Terraform or AWS CDK for infrastructure
- Bedrock evaluation jobs, or Langfuse / LangSmith for tracing and evals

## A Note on Fast-Moving Facts

AgentCore and Bedrock ship frequently. The steering files deliberately avoid
hardcoding compute pricing and blanket component-GA claims. Verify status
against the
[AgentCore release notes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/release-notes.html)
and [pricing page](https://aws.amazon.com/bedrock/agentcore/pricing/) at design
time, and cite the date you checked.
