---
inclusion: always
description: MCP client/server/transport model, where to host an MCP server on AWS, the inbound/outbound auth decision tree, and the two gotchas that bite in production.
---

# MCP Architecture

The Model Context Protocol is how agents in this workspace reach tools. Design
the tool surface deliberately: it is the part of an agent system that leaks
across team boundaries and outlives the agent itself.

## The Model

- **Host / client** — the agent process. Opens a session, discovers tools, calls them.
- **Server** — exposes `tools`, `resources`, and `prompts` over a transport.
- **Transport** — `stdio` for local, co-located servers; **streamable-HTTP** for
  remote servers. Remote servers in this workspace use streamable-HTTP;
  `mcp.run(transport="streamable-http")` on the server, `streamablehttp_client`
  on the client.

Tools are a public API. Version them, document their error contracts, and treat
a change to a tool signature as a breaking change to every agent that calls it.

## Where to Host a Server

| Option | Good for | Cost shape | Watch out for |
|--------|----------|-----------|---------------|
| **AgentCore Gateway** | Wrapping Lambda functions, OpenAPI/Smithy APIs, and existing services as MCP tools — and fronting servers you already run | $0.005 / 1,000 API invocations + $0.02 / 100 tools indexed / month | You are adopting Gateway's auth and listing semantics; read the gotchas below |
| **AgentCore Runtime** | A container you own that serves MCP | See [pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) | Container **must** serve at `0.0.0.0:8000/mcp` |
| **Lambda + Function URL** | A small, spiky, self-contained server | Per-request | Cold starts on a chatty tool loop; streaming behaviour |
| **Fargate / ECS** | Long-lived servers, heavy deps, steady traffic | Per-hour | You own scaling, patching, and the load balancer |

Default: **Gateway** when the tools are already APIs or Lambdas — it is the
lowest-code path and gives you semantic discovery for free. Reach for Runtime or
Lambda when the server has real logic of its own.

## Auth Decision Tree

Two independent questions. Answer both, in the design.

**Inbound** — how does the agent authenticate *to* Gateway? OAuth per the MCP
spec, with native integration for **Amazon Cognito, Okta, and Auth0**, plus
custom providers. Supports **3LO** (authorization code) and **2LO** (client
credentials).

**Outbound** — how does Gateway authenticate *to* the target?

```
Is the target public / unauthenticated?
├─ Yes → none
└─ No
   ├─ Does the call need the END USER's identity and consent?
   │    → OAuth 3LO (per-end-user tokens; GA for MCP-server targets April 2026)
   ├─ Is it machine-to-machine?
   │    → OAuth 2LO (client credentials)
   ├─ Is it an AWS endpoint?
   │    → IAM SigV4 — supported for API Gateway and Lambda Function URLs.
   │      NOT for ALB, and NOT for direct EC2 endpoints. Confirm the target
   │      type before choosing SigV4; this is a common design dead-end.
   └─ Legacy third-party service with a static secret?
        → API key (rotate it; store it in Secrets Manager, never in the manifest)
```

## Semantic Tool Discovery

Gateway ships `x_amz_bedrock_agentcore_search` — natural-language lookup over
the indexed tool set. This is the answer to tool overload: past a few dozen
tools, stuffing every schema into the context window degrades routing accuracy
and inflates every single turn's token bill. Semantic search scales the tool
surface to thousands without scaling the prompt.

Design implication: **write tool descriptions for a retriever, not for a human.**
State what the tool does, what it needs, and when *not* to use it.

## Two Gotchas

1. **`DYNAMIC` listing mode is incompatible with semantic search and with
   outbound 3LO.** If your design needs either, do not use `DYNAMIC`. Discovering
   this after the Gateway is provisioned means a rebuild of the target
   configuration. Decide at design time and record it.
2. **IAM SigV4 outbound does not work with ALB or direct EC2 endpoints** — only
   API Gateway and Lambda Function URLs. A server behind an ALB needs OAuth or an
   API key instead.

## The 401 Handshake

Runtime's OAuth follows **RFC 6749**. A request without a valid Bearer token
returns **HTTP 401 with a `WWW-Authenticate` header** (RFC 7235) pointing the
client at the authorization server; the metadata is discoverable through
`GetRuntimeProtectedResourceMetadata`.

Self-hosted MCP servers in this workspace implement the same handshake. Clients
should treat a 401 as "go get a token and retry", not as a terminal failure —
and the server must actually emit the `WWW-Authenticate` header, or the client
has nowhere to go.

## Rules

- Every MCP server design names its transport, its host, and both auth directions.
- Tool descriptions are written to be retrieved; include a "do not use when" clause.
- Never put a credential in a tool manifest — Secrets Manager, referenced by ARN.
- Test the server standalone (MCP Inspector or a raw `streamablehttp_client`
  script) before wiring it to an agent. Debugging a broken tool through a model's
  tool loop is the slowest possible way to find a JSON schema typo.
- Record the listing mode and the reason, given gotcha 1.
