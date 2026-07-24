---
name: mermaid-diagrams
description: Author Mermaid diagrams for architecture work — C4 context/container/component, sequence, deployment, flowchart, and state diagrams with copy-paste examples and CLI validation. Use when the user wants a text-based diagram, a diagram embedded in Markdown, or a quick architecture sketch.
---

# Mermaid Diagrams

Text-first diagramming for architecture documents, specs, and READMEs. Mermaid
renders natively in GitHub, GitLab, and most Markdown viewers; sources live in
the repo and diff cleanly.

**Mermaid vs draw.io** (see also the `diagramming-conventions` steering file):
use Mermaid for logical views (C4, sequence, state, flows) embedded in
Markdown; use the `drawio-aws`/`drawio-azure`/`drawio-gcp` skills when the
audience expects official cloud provider icons or a standalone `.drawio`
artifact.

## Validation

Every diagram must compile before it ships:

```bash
npx -y @mermaid-js/mermaid-cli -i diagram.mmd -o /tmp/diagram.svg
```

Exit code 0 = valid. For diagrams embedded in Markdown, extract the fenced
block to a temp `.mmd` file first. Render PNG for decks/docs with `-o out.png -s 3`.

## C4 Model (levels 1–3)

Mermaid has first-class C4 syntax. Keep one level per diagram (see the
`c4-model` steering file for when to use each level).

### Level 1 — System Context

```mermaid
C4Context
  title System Context — Order Platform
  Person(customer, "Customer", "Places orders via web/mobile")
  System(orders, "Order Platform", "Accepts, prices, and fulfils orders")
  System_Ext(payments, "Payment Gateway", "Card authorisation")
  System_Ext(email, "Email Provider", "Transactional email")
  Rel(customer, orders, "Browses, orders", "HTTPS")
  Rel(orders, payments, "Authorises payment", "HTTPS/REST")
  Rel(orders, email, "Sends confirmations", "SMTP/API")
```

### Level 2 — Container

```mermaid
C4Container
  title Container View — Order Platform
  Person(customer, "Customer")
  System_Boundary(plat, "Order Platform") {
    Container(web, "Web App", "React", "Customer-facing storefront")
    Container(api, "Order API", "Node.js/Fastify", "Order lifecycle endpoints")
    Container(worker, "Fulfilment Worker", "Node.js", "Consumes order events")
    ContainerDb(db, "Order DB", "PostgreSQL", "Orders, customers, payments")
    ContainerQueue(bus, "Event Bus", "EventBridge", "OrderPlaced, OrderShipped")
  }
  Rel(customer, web, "Uses", "HTTPS")
  Rel(web, api, "Calls", "JSON/HTTPS")
  Rel(api, db, "Reads/writes", "SQL")
  Rel(api, bus, "Publishes events")
  Rel(bus, worker, "Delivers events")
```

### Level 3 — Component

```mermaid
C4Component
  title Component View — Order API
  Container_Boundary(api, "Order API") {
    Component(ctrl, "Order Controller", "Fastify routes", "HTTP surface")
    Component(svc, "Order Service", "TypeScript", "Pricing, validation, state")
    Component(repo, "Order Repository", "Knex", "Persistence")
    Component(pub, "Event Publisher", "AWS SDK", "Emits domain events")
  }
  ContainerDb_Ext(db, "Order DB", "PostgreSQL")
  Rel(ctrl, svc, "Invokes")
  Rel(svc, repo, "Uses")
  Rel(repo, db, "SQL")
  Rel(svc, pub, "Emits OrderPlaced")
```

## Sequence Diagram

One critical flow per diagram; name participants after containers, not classes.

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant W as Web App
  participant A as Order API
  participant P as Payment Gateway
  participant B as Event Bus
  C->>W: Checkout
  W->>A: POST /orders
  A->>P: Authorise card
  alt authorised
    P-->>A: auth_id
    A->>B: OrderPlaced event
    A-->>W: 201 Created
  else declined
    P-->>A: decline reason
    A-->>W: 402 Payment Required
  end
```

## Deployment View (flowchart + subgraphs)

Mermaid has no dedicated deployment type; model zones as nested subgraphs.

```mermaid
flowchart TB
  subgraph region["AWS eu-west-1"]
    subgraph vpc["VPC 10.0.0.0/16"]
      subgraph pub["Public subnets (2 AZs)"]
        alb[ALB]
      end
      subgraph priv["Private subnets (2 AZs)"]
        svc1[ECS Service - api]
        svc2[ECS Service - worker]
      end
      subgraph data["Data subnets (2 AZs)"]
        rds[(RDS PostgreSQL Multi-AZ)]
      end
    end
  end
  users((Users)) -->|HTTPS 443| alb --> svc1
  svc1 --> rds
  svc2 --> rds
```

## State Diagram

For lifecycle entities (order status, provisioning states, DR modes).

```mermaid
stateDiagram-v2
  [*] --> Placed
  Placed --> Paid: payment authorised
  Placed --> Cancelled: timeout / customer cancel
  Paid --> Shipped: fulfilment complete
  Shipped --> Delivered: carrier confirmation
  Delivered --> [*]
  Cancelled --> [*]
```

## Authoring Rules

- **One concern per diagram.** Split rather than cram; a diagram with >15 nodes
  needs decomposition or a lower C4 level.
- **Stable IDs.** Node IDs (`api`, `rds`) are code — keep them short, reuse them
  consistently across diagrams in the same spec.
- **Direction**: `TB` for layered/deployment views, `LR` for pipelines.
- **No styling by default.** Add `classDef` colors only to encode meaning (e.g.
  external vs owned) and always add a legend node when you do.
- **Label edges with protocol/verb** ("JSON/HTTPS", "publishes"), not vague
  arrows.
- Escape or avoid `(){}[]` inside labels — quote labels that contain them.

## Embedding

- In spec/design Markdown: fenced ` ```mermaid ` blocks inline.
- In docx/pptx deliverables: render PNG at scale 3 and embed the image (see
  `architecture-doc` / `architecture-deck` skills); commit the `.mmd` source
  next to the artifact.
