---
name: bedrock-rag
description: >-
  Build RAG on Amazon Bedrock Knowledge Bases — ingestion, chunking, embeddings,
  vector stores, Retrieve and RetrieveAndGenerate, citations, and Guardrails
  contextual grounding. Use when a chatbot must answer from a document corpus
  with sources.
---

# RAG on Bedrock Knowledge Bases

Activate this skill when building retrieval-augmented answering on AWS. For the
framework-agnostic, self-hosted-vector-DB flavour, see the `data-ai` preset's
RAG material; this skill is the AWS-native path.

## When to Use

- A chatbot must answer from internal documents with citations
- Choosing a chunking strategy, embedding model, or vector store
- Wiring retrieval into a Strands agent as a tool
- Diagnosing "the answer is wrong" in a RAG system

## The Pipeline

```
S3 source → StartIngestionJob → chunk → embed → vector store
                                                     ↓
user query → (optional rewrite) → Retrieve → rerank → prompt + context
                                                     ↓
                          generate → citations → output guardrail → user
```

Most RAG failures are **retrieval** failures, not generation failures. Before
touching the prompt, check whether the correct chunk was retrieved at all. If it
was not, no amount of prompt engineering fixes it.

## Chunking

The single highest-leverage config choice.

| Strategy | Use when |
|----------|----------|
| Fixed-size + overlap | Homogeneous prose; the safe default (~300–500 tokens, 10–20% overlap) |
| Hierarchical | Long structured documents; retrieve small, return the parent for context |
| Semantic | Topic boundaries matter more than length; costs more to ingest |
| No chunking | Documents are already short and self-contained (FAQs, tickets) |

Preserve structure in the chunk text — a heading path prepended to each chunk
materially improves retrieval on technical corpora. Attach metadata (source
document, section, last-modified, access tier) at ingestion; metadata filtering
at query time is how you enforce per-user document access without a second index.

## Retrieval and Generation

`Retrieve` when the agent should reason over the results:

```python
resp = bedrock_agent_runtime.retrieve(
    knowledgeBaseId=KB_ID,
    retrievalQuery={"text": query},
    retrievalConfiguration={"vectorSearchConfiguration": {
        "numberOfResults": 10,
        "overrideSearchType": "HYBRID",   # semantic + keyword
        "filter": {"equals": {"key": "access_tier", "value": user_tier}},
    }},
)
```

`RetrieveAndGenerate` when one grounded answer is the whole job:

```python
resp = bedrock_agent_runtime.retrieve_and_generate(
    input={"text": query},
    retrieveAndGenerateConfiguration={
        "type": "KNOWLEDGE_BASE",
        "knowledgeBaseConfiguration": {
            "knowledgeBaseId": KB_ID,
            "modelArn": MODEL_ARN,
            "generationConfiguration": {"guardrailConfiguration": {
                "guardrailId": GUARDRAIL_ID, "guardrailVersion": "DRAFT"}},
        },
    },
)
```

**Hybrid search beats pure semantic** on corpora full of identifiers, error
codes, and product names — exactly the corpora internal assistants are built on.

Inside a Strands agent, wrap retrieval as a tool so the model can decide to
search, refine, and search again:

```python
@tool
def search_knowledge_base(query: str) -> list[dict]:
    """Search internal documentation. Returns passages with source urls.
    Call this before answering any factual question about our products."""
```

## Citations Are a Contract

- Every factual claim carries a citation to a retrieved passage.
- **Verify citations programmatically** — that the cited source exists and was in
  the retrieved set. A plausible-looking citation to a document that was never
  retrieved is the most damaging failure mode in a knowledge assistant, because
  it looks like rigour.
- When retrieval returns nothing relevant, the correct answer is "I don't have
  that information." Make refusal an explicitly rewarded behaviour in the eval
  set, not an accident.

## Guardrails

Attach a Bedrock Guardrail with **contextual grounding** enabled so responses
unsupported by the retrieved context are rejected, plus PII filters on both input
and output. See `responsible-ai`.

## Evaluation

Bedrock's RAG evaluation and LLM-as-a-Judge went **GA on 20 March 2025**
(preview from 1 December 2024). Use the platform's metric names verbatim:

| Family | Metrics |
|--------|---------|
| Retrieval | context relevance, coverage, citation precision, citation coverage |
| Generation / quality | correctness, completeness, faithfulness (hallucination detection), helpfulness |
| Responsible AI | harmfulness, answer refusal, stereotyping |

Split the diagnosis: **retrieval metrics tell you whether the right context was
found; generation metrics tell you what the model did with it.** Wire a
`CreateEvaluationJob` run as a CI gate with thresholds in config — see
`agent-evaluation`.

## Cost

Drivers: ingestion (embedding calls × chunks), storage (vector store hours or
capacity units), and per-query (embedding call + retrieved-token input + output
tokens). Retrieved context dominates input tokens at chat volume, so
`numberOfResults` is a cost knob as much as a quality knob. Do not invent
per-token figures — link [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/).

## Rules

- Diagnose retrieval before generation.
- Hybrid search by default on technical corpora.
- Metadata filtering enforces document access; never rely on the prompt for it.
- Citations verified programmatically against the retrieved set.
- Refusal on empty retrieval is correct behaviour and is tested as such.
- Re-ingest on source change; a stale index is a wrong answer with a citation.
- Retrieved documents are untrusted input — they can carry prompt injection.
