---
name: mcp-server-hosting
description: >-
  Build and host a remote MCP server on AWS — Lambda, Fargate/ECS, or AgentCore
  Runtime — with OAuth via Cognito, Okta, or Auth0 and the RFC 7235 401 +
  WWW-Authenticate handshake. Use when deploying an MCP server for remote agents
  rather than local stdio use.
---

# MCP Server Hosting on AWS

Activate this skill when an MCP server must be reachable by remote agents.
For *authoring* server logic and tool design see `mcp-builder`; this skill is
about where it runs and how it is protected.

## When to Use

- Promoting a local `stdio` MCP server to a remote, multi-tenant service
- Choosing between Lambda, Fargate/ECS, and AgentCore Runtime
- Adding OAuth to an MCP server
- Debugging the 401 / token / retry handshake

## Transport

Local, co-located servers use `stdio`. **Remote servers use streamable-HTTP.**

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(host="0.0.0.0", stateless_http=True)

@mcp.tool()
def search_docs(query: str, limit: int = 5) -> list[dict]:
    """Search internal documentation. Returns title, url, and snippet per hit.
    Do not use for customer records — see lookup_customer."""
    ...

mcp.run(transport="streamable-http")
```

Client side:

```python
from mcp.client.streamable_http import streamablehttp_client
from mcp import ClientSession

async with streamablehttp_client(url, headers=auth_headers) as (read, write, _):
    async with ClientSession(read, write) as session:
        await session.initialize()
        result = await session.call_tool("search_docs", {"query": "refund policy"})
```

`stateless_http=True` matters on Lambda: with per-request containers there is no
reliable place to hold session state between invocations.

## Choosing a Host

| Host | Good for | Watch out for |
|------|----------|---------------|
| **AgentCore Gateway** | The tools are already Lambdas or REST APIs — no server to write at all | See `agentcore-gateway-mcp`; adopt its auth and listing semantics |
| **AgentCore Runtime** | A container you own, agent-adjacent | Must serve at `0.0.0.0:8000/mcp`, streamable-HTTP |
| **Lambda + Function URL** | Small, spiky, self-contained servers | Cold starts on a chatty tool loop; response streaming limits; 15-minute ceiling |
| **Fargate / ECS** | Long-lived, heavy dependencies, steady traffic | You own scaling, patching, and the load balancer — and an ALB rules out Gateway SigV4 outbound auth |

If the server will later be registered as a Gateway MCP target, the host choice
constrains the auth choice: **IAM SigV4 outbound works with API Gateway and
Lambda Function URLs only — not ALB, not direct EC2.** Pick the host with that
in mind.

## AgentCore Runtime Contract

Two non-negotiables when hosting MCP on Runtime:

- Serve at **`0.0.0.0:8000/mcp`** — the default of most official MCP SDKs, so do
  not override host or port.
- Transport is **streamable-HTTP**.

## OAuth and the 401 Handshake

AgentCore Runtime's OAuth follows **RFC 6749**. Self-hosted servers in this
workspace implement the same shape, so a client works against either.

A request with a missing or invalid Bearer token returns **HTTP 401 with a
`WWW-Authenticate` header** (RFC 7235) that points the client at the
authorization server. On Runtime, the resource metadata is discoverable through
`GetRuntimeProtectedResourceMetadata`.

```
Client → Server   POST /mcp   (no Authorization header)
Server → Client   401 Unauthorized
                  WWW-Authenticate: Bearer realm="mcp",
                    resource_metadata="https://…/.well-known/oauth-protected-resource"
Client → Metadata GET the resource metadata → discover the authorization server
Client → IdP      token request (2LO client_credentials, or 3LO auth code)
IdP    → Client   access_token
Client → Server   POST /mcp   Authorization: Bearer <token>
Server → Client   200 + MCP response
```

Two failure modes worth testing explicitly:

- **The server returns 401 with no `WWW-Authenticate` header.** The client has
  nowhere to go and the handshake dead-ends. Assert the header in a test.
- **The client treats 401 as terminal.** It should fetch a token and retry once,
  then fail.

Identity providers: **Amazon Cognito, Okta, and Auth0** integrate natively with
AgentCore; custom providers are supported. Cognito is the low-friction choice
when everything is already in one AWS account.

Validate the token properly on every request: signature against the JWKS
endpoint (cached), `iss`, `aud`, `exp`, and the required scope for the specific
tool being called. Scope per tool, not per server — otherwise one token grants
the whole surface.

## Testing Before Wiring

Test the server standalone before connecting an agent. Debugging a JSON schema
typo through a model's tool loop is the slowest possible path to the answer.

```bash
npx @modelcontextprotocol/inspector          # interactive local testing
```

Then a scripted `streamablehttp_client` integration test against the deployed
URL covering: unauthenticated → 401 with header, authenticated → `list_tools`
returns the expected set, each tool's happy path, and each tool's error contract.

## Rules

- Remote means streamable-HTTP; `stdio` is for local only.
- On Runtime: `0.0.0.0:8000/mcp`. No exceptions.
- Always emit `WWW-Authenticate` on 401, and test that you do.
- Validate signature, `iss`, `aud`, `exp`, and per-tool scope on every request.
- Choose the host with the downstream Gateway auth matrix in mind — an ALB
  forecloses SigV4.
- Tools return errors as data, not exceptions; keep results small and truncated.
- Never log the Bearer token, and redact tool arguments that carry PII.
