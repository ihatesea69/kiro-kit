# Requirements Document

## Introduction

This document defines the requirements for a **Retrieval-Augmented Generation (RAG) Chatbot** that answers user questions by grounding its responses in a curated document corpus. The pipeline covers the full lifecycle: document ingestion, chunking, and embedding into a vector store; retrieval and reranking of the most relevant chunks; prompt assembly with citation markers; LLM answer generation with inline citations; and graceful abstention when no sufficiently relevant context is found. Hallucination mitigation is addressed at multiple layers — retrieval threshold filtering, citation grounding checks, and faithfulness evaluation — rather than relying on a single guardrail.

The system exposes a conversational REST API and includes evaluation hooks that measure both retrieval quality (precision, recall, MRR of retrieved chunks) and answer quality (faithfulness to context, answer relevance, and citation accuracy), enabling integration with the LLM Evaluation Harness for continuous quality monitoring.

## Glossary

| Term | Definition |
|------|-----------|
| Document | A source file (PDF, Markdown, plain text, HTML) ingested into the RAG corpus; the atomic unit of the ingestion pipeline. |
| Chunk | A fixed-length overlapping text segment extracted from a document; the unit that is embedded and indexed in the vector store. |
| Embedding | A dense float vector representation of a chunk, produced by a sentence-transformer model and stored in the vector store. |
| Vector Store | A database that stores chunk embeddings and supports approximate nearest-neighbour (ANN) search; uses Qdrant in this implementation. |
| Retrieval | The step that performs an ANN query in the vector store to find the top-K most semantically similar chunks for a user query. |
| Reranker | A cross-encoder model that re-scores the top-K retrieved chunks and returns a smaller, higher-precision shortlist for context assembly. |
| Context Window | The concatenated set of reranked chunks passed to the LLM as the grounding context for answer generation. |
| Citation | A reference in the LLM's answer to a specific chunk, identified by its `chunk_id` and the source document title and page number. |
| Abstention | A system response that explicitly declines to answer because no retrieved chunk has a relevance score above the configured threshold. |
| Faithfulness | A measure of whether every factual claim in the LLM's answer is supported by at least one retrieved chunk in the context window; computed by `ragas`. |
| Answer Relevance | A measure of how well the LLM's answer addresses the user's question, computed by `ragas`. |
| Context Precision | The fraction of retrieved chunks that are actually relevant to the query (retrieval precision), computed by `ragas`. |
| Context Recall | The fraction of ground-truth relevant chunks that are retrieved (retrieval recall), computed by `ragas`. |
| MRR | Mean Reciprocal Rank; measures the rank position of the first relevant chunk in the retrieval result set. |
| Hallucination | A factual claim in the LLM answer that is not supported by any chunk in the context window. |

## Out of Scope

- Training or fine-tuning the embedding model or the LLM; this pipeline uses pre-trained models.
- Real-time document ingestion at query time; document indexing is a separate offline batch process.
- Multi-turn conversation memory across sessions; this implementation is single-turn (each query is independent).
- Structured data retrieval (SQL, graphs); this pipeline handles unstructured text documents only.
- User authentication and authorisation; security is delegated to the API gateway layer.

## Requirements

### Requirement 1: Document Ingestion, Chunking, and Embedding

**User Story:** As a data engineer, I want to ingest source documents into the RAG corpus with automatic chunking, embedding, and provenance tracking, so that the vector store is always up to date and every chunk can be traced back to its source document, page, and position.

#### Acceptance Criteria

1. WHEN a document ingestion run is triggered via `python -m rag.ingestion --source <path_or_dir>`, THE SYSTEM SHALL support the file types `.pdf` (using `pypdf`), `.md`, `.txt`, and `.html` (using `beautifulsoup4`), extract plain text, and emit an `UnsupportedFileTypeError` for any other extension without halting the overall run.
2. WHEN a document's text is extracted, THE SYSTEM SHALL split it into overlapping chunks using a sliding window with `chunk_size` (default 512 tokens) and `chunk_overlap` (default 64 tokens) configurable in `configs/rag_config.yaml`, measured in tokens using the tokenizer of the configured embedding model.
3. WHEN chunks are created, THE SYSTEM SHALL assign each chunk a `chunk_id` composed as `{doc_id}:{chunk_index}`, store the source `doc_id`, `filename`, `page_number` (where available), `chunk_index`, `char_start`, `char_end`, and `text` fields in the chunk metadata.
4. WHEN chunks are ready for embedding, THE SYSTEM SHALL encode them in batches of `config.embedding_batch_size` (default 64) using `sentence-transformers` (model: `BAAI/bge-large-en-v1.5`), producing L2-normalised float32 vectors of dimension 1024, and upsert each chunk with its embedding and full metadata into the configured Qdrant collection.
5. WHEN a document that already exists in the vector store (matched by `doc_id` = SHA-256 of the file path + last-modified timestamp) is ingested again, THE SYSTEM SHALL delete all existing chunks for that `doc_id` from the vector store before upserting the new chunks, ensuring no stale chunks remain after an update.
6. WHEN the ingestion run completes, THE SYSTEM SHALL write an ingestion manifest to `data/ingestion_manifests/{run_id}.json` containing: total documents processed, total chunks created, total chunks upserted, list of errored files with their error messages, and UTC timestamp — without raising an exception for individual file errors that were caught and logged.
7. WHERE `configs/rag_config.yaml` sets `incremental: true`, THE SYSTEM SHALL skip documents whose `doc_id` already exists in the manifest store `data/doc_registry.jsonl` with a matching file hash, processing only new or modified files.

---

### Requirement 2: Vector Store Management and Retrieval

**User Story:** As an ML engineer, I want the vector store to support efficient ANN retrieval with metadata filters and return scored results, so that the retrieval step is both fast and transparent about why each chunk was selected.

#### Acceptance Criteria

1. WHEN the RAG service initialises, THE SYSTEM SHALL connect to the Qdrant instance specified by `QDRANT_URL` and `QDRANT_API_KEY` environment variables, verify that the collection specified by `config.collection_name` exists (creating it with the correct vector dimension and `Cosine` distance metric if absent), and raise a `VectorStoreConnectionError` if the connection fails after 3 retries with exponential backoff.
2. WHEN a query is submitted to the retrieval step, THE SYSTEM SHALL embed the query text using the same `BAAI/bge-large-en-v1.5` model used at ingestion time (loaded once at service start and shared across requests), search the Qdrant collection for the top `config.retrieval_top_k` (default 20) chunks by cosine similarity, and return each result with its `chunk_id`, `score`, and full metadata.
3. WHEN no retrieved chunk has a cosine similarity score above `config.retrieval_min_score` (default 0.70), THE SYSTEM SHALL classify the query as unanswerable and return an abstention response (per R5.1) rather than passing low-confidence chunks to the reranker and LLM.
4. WHEN metadata filters are specified in the request (e.g., `source_doc: "policy_handbook.pdf"`), THE SYSTEM SHALL apply a Qdrant `Filter` on the `filename` metadata field to restrict the ANN search to chunks from matching documents, returning at most `config.retrieval_top_k` results from the filtered subset.
5. WHERE `config.retrieval_top_k` is set above 50, THE SYSTEM SHALL emit a `HighRetrievalKWarning` at startup and cap the value at 50, because retrieving more than 50 chunks per query causes the reranker's latency to exceed the API's p95 SLA.

---

### Requirement 3: Reranking and Context Assembly

**User Story:** As an ML engineer, I want the top-K retrieved chunks to be reranked by a cross-encoder model before being passed to the LLM, so that the context window contains the highest-precision subset of chunks and the LLM is not distracted by marginally relevant content.

#### Acceptance Criteria

1. WHEN the retrieval step returns `config.retrieval_top_k` chunks, THE SYSTEM SHALL rerank them using a `cross-encoder/ms-marco-MiniLM-L-6-v2` cross-encoder loaded at service start, scoring each (query, chunk_text) pair, and returning the top `config.rerank_top_n` (default 5) chunks by reranker score.
2. WHEN the reranker returns its top-N shortlist, THE SYSTEM SHALL assemble the context window by concatenating the chunks in reranker score order (highest first), prepending each with a citation marker `[C{n}]` (e.g., `[C1]`, `[C2]`) and the source document title, truncating the assembled context to `config.context_max_tokens` (default 2 048 tokens) at chunk boundaries — never mid-sentence.
3. IF all reranked chunks have a cross-encoder score below `config.rerank_min_score` (default 0.30), THE SYSTEM SHALL escalate to abstention (per R5.1) rather than sending low-confidence context to the LLM.
4. WHEN the context window is assembled, THE SYSTEM SHALL produce a `ContextBundle` object containing: the ordered list of selected `RetrievedChunk` objects with their citation indices, the assembled context string, the total token count, and the original query — this is the input to the prompt builder.
5. WHERE fewer than `config.rerank_top_n` chunks survive retrieval (fewer than 5 results returned from Qdrant), THE SYSTEM SHALL rerank all available chunks without padding, assemble a context window from what is available, and log a `SmallContextWarning` with the actual chunk count.

---

### Requirement 4: Prompt Assembly and LLM Answer Generation with Citations

**User Story:** As a developer, I want the LLM to produce answers that include inline citation markers corresponding to the context chunks, so that users and auditors can trace every factual claim to its source chunk.

#### Acceptance Criteria

1. WHEN the context bundle is ready, THE SYSTEM SHALL assemble the final prompt using a Jinja2 template (`templates/rag_prompt.j2`) that injects the context window (with `[C1]…[CN]` markers), the user query, and a system instruction that tells the LLM to: (a) answer only from the provided context, (b) insert citation markers `[C{n}]` inline after each factual claim, and (c) respond with `"I don't have enough information to answer this question."` if the context is insufficient.
2. WHEN the LLM generates an answer, THE SYSTEM SHALL call the LLM API (OpenAI-compatible endpoint configured via `LLM_API_BASE` and `LLM_API_KEY`) with `temperature=0.2` and `max_tokens=config.answer_max_tokens` (default 512); parse the response; extract the answer text.
3. WHEN the answer text is received, THE SYSTEM SHALL parse inline citation markers `[C{n}]` using a regex, resolve each `n` to the corresponding `RetrievedChunk`'s `chunk_id`, `filename`, and `page_number`, and build a structured `citations` list; any citation marker `[C{n}]` where `n > len(context_bundle.chunks)` is flagged as an `InvalidCitationWarning`.
4. WHEN the API returns the response to the caller, THE SYSTEM SHALL include: `answer` (the generated text with inline markers preserved), `citations` (list of resolved citation objects), `abstained` (bool), `model_id`, `retrieval_scores` (top-K chunk IDs and cosine scores), `reranker_scores` (top-N chunk IDs and cross-encoder scores), `context_token_count`, `latency_ms` (end-to-end from query receipt to response sent), and `request_id`.
5. IF the LLM API call fails (network error, rate limit, non-200 status), THE SYSTEM SHALL retry once after 2 seconds; if the retry also fails, THE SYSTEM SHALL return an HTTP 503 response with `{"error": "LLM_UNAVAILABLE", "request_id": "..."}` rather than serving a cached or hallucinated answer.

---

### Requirement 5: Abstention and Hallucination Mitigation

**User Story:** As an ML engineer, I want the chatbot to abstain explicitly when context is insufficient and to verify that generated answers are grounded in the retrieved context, so that users receive honest uncertainty signals and hallucinations are minimised.

#### Acceptance Criteria

1. WHEN an abstention condition is triggered — either retrieval score below `config.retrieval_min_score` (R2.3), reranker score below `config.rerank_min_score` (R3.3), or the LLM's own `"I don't have enough information"` response pattern — THE SYSTEM SHALL return a structured response with `abstained: true`, `answer: "I don't have enough information to answer this question."`, an empty `citations` list, and `abstention_reason` set to one of `"retrieval_threshold"`, `"reranker_threshold"`, or `"llm_self_abstention"`.
2. WHEN the LLM returns a non-abstention answer, THE SYSTEM SHALL run a faithfulness check by calling `ragas.metrics.Faithfulness` with the answer text and context window; if the faithfulness score is below `config.faithfulness_min_score` (default 0.70), THE SYSTEM SHALL log a `LowFaithfulnessWarning` with the `request_id`, the faithfulness score, and the answer, but still return the answer to the user — faithfulness is logged and monitored, not used to block responses synchronously.
3. WHEN an answer contains inline citation markers, THE SYSTEM SHALL verify that at least 80 % of sentences in the answer that make factual claims contain at least one `[C{n}]` marker (factual sentences detected by excluding sentences that are questions, greetings, or hedges); if below 80 %, THE SYSTEM SHALL add an `"uncited_claims_warning": true` flag to the response metadata.
4. WHEN the LLM API response contains any text that matches a pattern in `configs/pii_patterns.yaml` or `configs/jailbreak_patterns.yaml`, THE SYSTEM SHALL suppress the answer, log a `SafetyFilterTriggered` warning with the `request_id`, and return an abstention response with `abstention_reason: "safety_filter"`.
5. WHERE `config.enable_faithfulness_check: false` is set (e.g., for latency-sensitive deployments), THE SYSTEM SHALL skip the `ragas` faithfulness check, set `faithfulness_score: null` in the response metadata, and log a startup notice that faithfulness monitoring is disabled.

---

### Requirement 6: Evaluation Hooks for Retrieval Quality and Answer Faithfulness

**User Story:** As an ML engineer, I want built-in evaluation hooks that compute retrieval quality metrics and answer faithfulness on a labelled evaluation set, so that I can track RAG pipeline quality as the document corpus and LLM change over time.

#### Acceptance Criteria

1. WHEN an evaluation run is triggered via `python -m rag.eval --eval-set <path>`, THE SYSTEM SHALL load a labelled evaluation JSONL file where each record has `query`, `expected_answer` (optional), `relevant_chunk_ids` (list of `chunk_id` values that are ground-truth relevant), and `doc_filter` (optional); run the full RAG pipeline for each record; and compute per-query and aggregate metrics.
2. WHEN retrieval metrics are computed, THE SYSTEM SHALL calculate: context precision at K (fraction of top-K retrieved chunks that are in `relevant_chunk_ids`), context recall (fraction of `relevant_chunk_ids` that appear in the top-K retrieved set), and MRR (reciprocal rank of the first relevant chunk in the retrieval result list).
3. WHEN faithfulness and answer relevance are computed for non-abstention responses, THE SYSTEM SHALL call `ragas.evaluate()` with `metrics=[Faithfulness(), AnswerRelevancy()]`, passing the query, answer, and list of context chunk texts; write per-query ragas scores to `results/rag_eval/{run_id}/per_query_metrics.jsonl`.
4. WHEN the evaluation run completes, THE SYSTEM SHALL write aggregate metrics to `results/rag_eval/{run_id}/aggregate_metrics.json` including: mean context precision, mean context recall, mean MRR, mean faithfulness, mean answer relevance, abstention rate, `safety_filter_rate`, and `low_faithfulness_rate` (fraction of non-abstention responses with faithfulness < 0.70).
5. IF a query in the evaluation set triggers abstention during the eval run, THE SYSTEM SHALL record it as `abstained: true` in `per_query_metrics.jsonl`, exclude it from faithfulness and answer relevance aggregates, and include it in `abstention_rate`.
6. WHERE the evaluation set contains queries with no `expected_answer` but with `relevant_chunk_ids`, THE SYSTEM SHALL compute retrieval metrics (context precision, recall, MRR) but skip `ragas` answer relevance for those queries, because answer relevance requires a reference answer.
