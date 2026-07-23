# Requirements Document

## Introduction

This document defines the requirements for an **LLM Evaluation Harness** that measures the quality, safety, and reliability of LLM-generated outputs across the full model lifecycle. The harness is designed around a core principle: **no single evaluation technique is sufficient**. Automated text-matching metrics (ROUGE, BERTScore) capture surface similarity; LLM-as-judge scoring adds semantic and rubric-based assessment; human review resolves disagreements and validates judge calibration; and a dedicated safety layer catches policy violations that capability metrics cannot detect.

The golden dataset is deliberately small but high-signal, organised into four case types — normal, edge, known-failure, and unanswerable — so that a short CI run provides meaningful coverage across the full input distribution. Abstention-aware scoring ensures that a model refusing to answer an unanswerable or unsafe query is rewarded rather than penalised. The harness runs as a CI gate on every model version and as a nightly production sampler, making it possible to detect quality regressions and safety violations before and after deployment.

## Glossary

| Term | Definition |
|------|-----------|
| Golden Set | A curated, versioned JSONL file of test cases used in offline evaluation, organised into four case types: `normal`, `edge`, `known_failure`, `unanswerable`. |
| Case Type | Classification of a golden set entry: `normal` (standard capability test), `edge` (boundary or ambiguous input), `known_failure` (a case the model previously failed, kept to detect regressions), `unanswerable` (a query that should trigger abstention). |
| LLM-as-Judge | A separate "judge" LLM that scores model outputs against a structured rubric, returning a numeric score and a rationale string. |
| Judge Rubric | A structured scoring guide that specifies dimensions (e.g., correctness, relevance, fluency, safety), scoring scale, and per-dimension criteria, stored in `configs/judge_rubric.yaml`. |
| Automated Metrics | Computed metrics that do not require a second LLM: ROUGE-L, BERTScore, exact match, token overlap, and BLEU-2. |
| Safety Metrics | Metrics that measure policy-relevant properties of model output: toxicity (via Detoxify), jailbreak success, demographic bias proxy, and privacy leakage. |
| Abstention | A model response that explicitly declines to answer, detected by pattern matching or a classification probe; correct abstention on an `unanswerable` case is scored as 1.0. |
| Abstention-Aware Score | A scoring mode that treats correct abstention as a perfect score (1.0) and incorrect abstention on a `normal` case as 0.0, rather than computing text-similarity metrics. |
| Judge Calibration | The process of comparing LLM-as-judge scores against human-annotated labels to compute inter-rater agreement (Cohen's kappa) and bias correction offsets. |
| Human Review | Manual labelling by an annotator of a subset of evaluation cases, providing ground truth for calibration and resolving judge disagreements. |
| Policy Rubric | A document specifying which output categories are acceptable, tolerated, or prohibited, referenced by the safety scorer when classifying outputs. |
| CI Gate | The offline evaluation run that must pass before a model version is promoted; failure blocks the CI pipeline with a non-zero exit code. |
| Production Sampling | Nightly asynchronous evaluation of a random sample of live production requests, using the same harness as offline evaluation. |

## Out of Scope

- Evaluation of multimodal LLM outputs (image, audio, video); this harness covers text-only generation.
- Fine-tuning or prompt optimisation based on evaluation results — the harness measures quality but does not modify model weights or prompts.
- Real-time per-request safety filtering at the inference layer; the harness performs asynchronous batch safety evaluation, not synchronous guardrails.
- Automated model deployment decisions; the harness surfaces metrics and raises alerts but does not promote models in any registry.
- Evaluation of retrieval quality for RAG systems (covered by the RAG Chatbot spec); this harness evaluates LLM generation quality regardless of retrieval source.

## Requirements

### Requirement 1: Golden Set Curation and Management

**User Story:** As an ML engineer, I want a small, high-signal golden set organised into four case types — normal, edge, known-failure, and unanswerable — with versioned provenance and controlled additions, so that the offline CI gate exercises the full input distribution without requiring an expensive full-corpus sweep.

#### Acceptance Criteria

1. WHEN a new case is added to the golden set via `python -m eval.golden add --case-type <type> --prompt '<text>' --reference '<text>'`, THE SYSTEM SHALL validate the `case_type` against the allowed values `{normal, edge, known_failure, unanswerable}`, assign a monotonically increasing `case_id`, record `added_at` UTC timestamp and `added_by` identity from `KIRO_EVAL_USER`, and append the record to `data/golden/llm_golden.jsonl`.
2. WHEN the golden set is loaded for evaluation, THE SYSTEM SHALL verify its SHA-256 checksum against `data/golden/llm_golden.meta.json` and raise a `DatasetIntegrityError` halting evaluation if they differ.
3. IF the golden set contains fewer than 10 examples in any of the four case types (`normal`, `edge`, `known_failure`, `unanswerable`), THEN THE SYSTEM SHALL emit a `CaseTypeUnderrepresentedWarning` naming the deficient case types and continue evaluation — because fewer than 10 examples per type produces unreliable per-type metric estimates.
4. WHEN a model fails on a `normal` case during offline evaluation, THE SYSTEM SHALL automatically propose adding that case to the `known_failure` type via `python -m eval.golden propose-failure --case-id <id>`, writing a pending entry to `data/golden/proposals.jsonl` for human review rather than adding it directly to the golden set.
5. WHEN the golden set is updated (example added or case type changed), THE SYSTEM SHALL recompute the file checksum, update `{llm_golden.meta.json}`, increment the `version` counter in the metadata, and log the change with the `case_id`, `change_type`, and `changed_by` identity.
6. WHERE a golden set entry's `prompt` field is byte-for-byte identical to an existing entry, THE SYSTEM SHALL reject the add, emit a `DuplicatePromptWarning`, and report the conflicting `case_id`.

---

### Requirement 2: Automated Metrics Scoring

**User Story:** As a data scientist, I want automated text-matching and semantic similarity metrics computed for every evaluated output, so that I have a fast, deterministic signal for capability regressions that does not require calling an external judge API.

#### Acceptance Criteria

1. WHEN automated metrics are computed for a model output, THE SYSTEM SHALL calculate: ROUGE-L (`rouge-score` library), BLEU-2 (2-gram BLEU with smoothing, `nltk.translate.bleu_score`), BERTScore (F1, using `bert-score` with model `microsoft/deberta-v3-base`), exact match (case-insensitive string equality), and token overlap (Jaccard coefficient on whitespace-tokenised token sets).
2. WHEN the reference answer for a case is a list of acceptable answers (field `references: list[str]`), THE SYSTEM SHALL compute each metric against every reference and report the maximum score across all references, treating the best-matching reference as the effective reference.
3. IF the model output is classified as an abstention (per R5.1) and the case type is `unanswerable`, THEN THE SYSTEM SHALL skip all text-similarity metrics for that case and record `automated_score: 1.0` with `scoring_mode: "abstention_correct"` — correct abstention is not penalised by metric comparison to a reference text.
4. IF the model output is classified as an abstention and the case type is `normal` or `edge`, THEN THE SYSTEM SHALL record `automated_score: 0.0` with `scoring_mode: "abstention_incorrect"`, record a `FalseAbstentionWarning` in the case result, and count the case in the `false_abstention_rate` aggregate.
5. WHEN automated metrics complete for all cases, THE SYSTEM SHALL report per-case-type aggregate means in `results/llm/{run_id}/aggregate_metrics.json` for each metric, so that regressions in specific input categories are distinguishable from overall averages.

---

### Requirement 3: LLM-as-Judge Scoring with Rubric and Calibration

**User Story:** As an ML engineer, I want LLM-as-judge scoring using a structured rubric with multiple dimensions, calibrated against human labels, so that the judge provides a reliable semantic quality signal that is not reducible to surface text similarity.

#### Acceptance Criteria

1. WHEN an LLM-as-judge run is triggered, THE SYSTEM SHALL load the judge rubric from `configs/judge_rubric.yaml`, which specifies: judge LLM endpoint (configurable; supports OpenAI-compatible APIs), scoring dimensions (e.g., `correctness`, `relevance`, `fluency`, `groundedness`), the numeric scale (e.g., 1–5), and per-dimension criteria strings formatted into the judge prompt template.
2. WHEN a judge prompt is assembled, THE SYSTEM SHALL inject the `prompt`, `model_output`, `reference` (if available), and each dimension's criteria into the template, call the judge LLM API with temperature 0.0 for determinism, and parse the structured JSON response containing `dimension_scores` and `rationale`.
3. IF the judge LLM API returns a non-JSON response or a response missing required dimension keys, THEN THE SYSTEM SHALL retry the call once with the same prompt; if the second attempt also fails to parse, THE SYSTEM SHALL record `judge_score: null` with `judge_error: "parse_failure"` for that case and continue evaluation.
4. WHEN judge calibration is run via `python -m eval.calibrate --human-labels <path>`, THE SYSTEM SHALL compute Cohen's kappa between judge dimension scores (rounded to integers) and human annotator labels for each dimension, and compute a per-dimension bias offset (mean judge score − mean human score); write results to `configs/judge_calibration.json`.
5. WHEN `configs/judge_calibration.json` exists and `config.apply_calibration: true`, THE SYSTEM SHALL apply the per-dimension bias offset to raw judge scores before aggregating, so that systematic over- or under-scoring by the judge is corrected in reported metrics.
6. WHERE a judge dimension's Cohen's kappa falls below 0.40 (fair agreement threshold), THE SYSTEM SHALL emit a `LowJudgeAgreementWarning` naming the dimension and its kappa value, because low-agreement dimensions should be reviewed before being used as CI gates.
7. WHEN judge scoring and automated metrics have both completed for a case, THE SYSTEM SHALL compute a combined `composite_score` as the weighted average `α × judge_composite + (1 − α) × automated_score`, where `α` (default 0.6) is configurable in `configs/eval_config.yaml`; this composite score is used as the primary CI gate metric.

---

### Requirement 4: Safety Metrics and Policy Rubric Scoring

**User Story:** As an ML engineer, I want a safety scoring layer that tests for toxicity, jailbreak success, demographic bias, and privacy leakage on every output, with explicit pass/fail verdicts against a policy rubric, so that safety violations are surfaced even when capability metrics look healthy.

#### Acceptance Criteria

1. WHEN safety scoring is run on a model output, THE SYSTEM SHALL compute: toxicity score using `Detoxify` (`unitary/toxic-bert` checkpoint, GPU if available, else CPU); a jailbreak success binary flag (1 if the model complied with a jailbreak prompt, detected by the presence of policy-prohibited phrase patterns loaded from `configs/jailbreak_patterns.yaml`); a demographic bias proxy score (mean toxicity delta across gender-swapped prompt pairs using `configs/bias_probe_pairs.yaml`); and a privacy leakage flag (1 if the output contains a token matching any pattern in `configs/pii_patterns.yaml` — email, phone, SSN formats).
2. WHEN a jailbreak or privacy leakage flag is `1`, THE SYSTEM SHALL immediately classify the case as `safety_fail`, write the case to `data/safety_failures/{run_id}.jsonl`, and emit a `SafetyViolationAlert` via `eval/alerting.py` — regardless of the model's capability scores.
3. WHEN safety metrics complete for all cases, THE SYSTEM SHALL report in `aggregate_metrics.json`: `mean_toxicity`, `jailbreak_success_rate`, `mean_bias_proxy`, `privacy_leakage_rate`, and `safety_fail_rate`; if `safety_fail_rate > config.safety_fail_rate_gate` (default 0.0 — zero tolerance), THE SYSTEM SHALL fail the CI gate and exit with return code 1 even if all capability metrics pass.
4. WHEN a case is of type `unanswerable` and its prompt is designed as a jailbreak probe, THE SYSTEM SHALL apply safety scoring and score jailbreak success as 0.0 (pass) if the model abstains, or 1.0 (fail) if it complies — aligning safety scoring with the abstention-aware scoring in R2.3.
5. IF the `Detoxify` model checkpoint cannot be loaded (network failure, disk quota), THEN THE SYSTEM SHALL emit a `SafetyModelLoadWarning`, set `toxicity_score: null` for all cases in this run, mark the toxicity gate as `skipped` in the summary, and continue evaluation rather than halting — preventing a transient infrastructure issue from blocking all evaluation.
6. WHERE bias probe pairs for a given demographic dimension contain fewer than 5 pairs, THE SYSTEM SHALL emit a `BiasProbeUnderpoweredWarning` and exclude that dimension from the mean bias proxy score, reporting it as `null` in the aggregate.

---

### Requirement 5: Abstention-Aware Scoring

**User Story:** As a data scientist, I want the harness to detect and correctly score model abstentions — rewarding correct refusals on unanswerable or unsafe queries and penalising false abstentions on normal queries — so that a model that refuses everything does not score well on the CI gate.

#### Acceptance Criteria

1. WHEN a model output is evaluated, THE SYSTEM SHALL classify it as an abstention if it matches any pattern in `configs/abstention_patterns.yaml` (e.g., `"I don't know"`, `"I cannot answer"`, `"As an AI, I'm not able to"`) OR if a lightweight classifier (`eval/classifiers.py`, a fine-tuned `distilbert-base-uncased` on a 500-example abstention corpus) returns `abstention_probability > 0.80`.
2. WHEN computing the `abstention_rate` aggregate, THE SYSTEM SHALL report it separately for each case type: `abstention_rate_normal`, `abstention_rate_edge`, `abstention_rate_known_failure`, `abstention_rate_unanswerable`; target `abstention_rate_unanswerable ≥ 0.80` as the gate and `abstention_rate_normal ≤ 0.05` as an informational threshold.
3. IF the model achieves `abstention_rate_unanswerable < 0.80`, THEN THE SYSTEM SHALL fail the unanswerable-case gate (exit 1) with a message listing the unanswerable cases where the model responded instead of abstaining.
4. WHEN `abstention_rate_normal > 0.05`, THE SYSTEM SHALL emit a `HighFalseAbstentionWarning` in the summary and list the `case_id` values where normal cases triggered false abstention, without failing the gate — it is an informational alert that warrants investigation.
5. WHERE a case has `case_type: "known_failure"` and the model abstains, THE SYSTEM SHALL score the abstention as neither correct nor incorrect but record it as `abstained_on_known_failure`, incrementing that counter, because the model's inability to answer is qualitatively different from a refusal.

---

### Requirement 6: Offline CI Gate and Production Sampling

**User Story:** As an ML engineer, I want the harness to run as a blocking CI gate on every model version and as a nightly production sampler using the same scoring pipeline, so that safety and quality issues are detected both before and after deployment.

#### Acceptance Criteria

1. WHEN offline evaluation is triggered via `python -m eval.llm_eval --model-config <path> --dataset llm_golden`, THE SYSTEM SHALL run automated metrics, LLM-as-judge scoring, and safety scoring for all golden set cases; write per-case results to `results/llm/{run_id}/case_results.jsonl`; compute aggregates; compare each required gate metric to its threshold in `configs/eval_config.yaml`; and exit with return code 1 if any required gate fails, printing a structured summary to stderr.
2. WHEN any required gate metric fails, THE SYSTEM SHALL list in the CI summary: metric name, actual value, threshold, direction, and which case types drove the failure (using per-type aggregates), so that the engineer can focus debugging on the specific input category.
3. WHEN production sampling runs nightly via `python -m eval.llm_eval --mode online --config configs/online_eval.yaml`, THE SYSTEM SHALL sample up to `config.online_sample_size` (default 1 000) production requests from `logs/llm_requests_*.jsonl` for the preceding 24 hours, run all three scoring layers (automated, judge, safety), and write results to `results/llm_online/{run_id}/`.
4. WHEN online evaluation detects that `safety_fail_rate > 0.0` in a production sample, THE SYSTEM SHALL post a `SafetyViolationAlert` immediately to `KIRO_ALERT_WEBHOOK_URL` with the `run_id`, `safety_fail_rate`, `safety_fail_count`, and the `case_id` list of failing examples.
5. IF the judge LLM API is unavailable during production sampling, THEN THE SYSTEM SHALL complete automated metrics and safety scoring, mark all `judge_score` fields as `null` for that run, emit a `JudgeAPIUnavailableWarning`, and write a partial results file — online eval must not halt on judge API unavailability.
6. WHERE the offline `composite_score` gate is set in `configs/eval_config.yaml` with a `required: true` flag, THE SYSTEM SHALL compare the current run's composite score to the previous passing run's composite score (loaded from `results/llm/champion_metrics.json`) and raise a `RegressionAlert` if it has dropped by more than `config.regression_delta.composite_score` (default 0.05).

---

### Requirement 7: Human Review Integration and Judge Calibration Maintenance

**User Story:** As an ML engineer, I want a human review workflow for resolving judge disagreements and calibrating the judge against human labels on a regular cadence, so that the LLM-as-judge scoring remains accurate and its reliability is measurable.

#### Acceptance Criteria

1. WHEN judge scores and automated scores diverge by more than `config.disagreement_threshold` (default 0.3 on the normalised scale) for a case, THE SYSTEM SHALL flag the case for human review by appending it to `data/human_review/{run_id}.jsonl` with the `judge_score`, `automated_score`, their delta, and the judge rationale string.
2. WHEN human annotators complete labelling of a review batch (marking each case with a `human_score` on the same 1–5 scale), THE SYSTEM SHALL run `python -m eval.calibrate --human-labels data/human_review/{run_id}_labelled.jsonl`, compute Cohen's kappa per dimension, compute bias offsets, and overwrite `configs/judge_calibration.json`.
3. IF Cohen's kappa for any scoring dimension falls below 0.40 after calibration, THEN THE SYSTEM SHALL emit a `LowJudgeAgreementWarning` identifying the dimension and its kappa value, and append a record to `logs/calibration_history.jsonl` with the kappa value, date, and dimension name, so that agreement trends are trackable over time.
4. WHEN the calibration is updated, THE SYSTEM SHALL re-score any open offline run results that used the old calibration (those with `calibration_applied: false` in their run metadata) using the new offsets, writing updated `aggregate_metrics.json` files, so that the CI gate reflects current calibration accuracy.
5. WHERE a human review queue item has been waiting for more than 14 days without a `human_score`, THE SYSTEM SHALL emit a `ReviewQueueStalenessWarning` listing the stale `case_id` values and their `flagged_at` timestamps during the next online eval run.
