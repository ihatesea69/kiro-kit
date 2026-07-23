# Requirements Document

## Introduction

This document defines the requirements for a **Model Evaluation Pipeline** that measures ML model quality in two complementary, tightly integrated modes. **Offline evaluation** runs the full evaluator suite against a curated, versioned golden dataset on every model commit, functioning as a CI quality gate that blocks promotion when metrics fall below configured thresholds or regress against the current champion model. **Online evaluation** samples live production traffic nightly, applies the identical evaluators, detects input distribution drift, and monitors offline↔online metric divergence — routing anomalous examples to a human review queue. Confirmed failure cases are fed back into the offline golden dataset through a controlled promotion step, closing the quality loop over time.

A first-class design concern is **regression alerting**: detecting when a challenger model underperforms the champion by more than a configurable delta per metric. Most off-the-shelf evaluation tooling reports only absolute values, silently permitting incremental regressions to accumulate across training runs. This pipeline surfaces regressions explicitly, as a CI-blocking alert with both values and the delta. Equally important is **example-level result storage**: every evaluated example is stored individually, enabling slice analysis and model-vs-model comparison, rather than only exposing aggregate numbers.

## Glossary

| Term | Definition |
|------|-----------|
| Golden Dataset | A curated, versioned, append-only set of (input, ground_truth) examples used in offline evaluation. Each example carries a unique `example_id` and provenance metadata. |
| Offline Evaluation | Evaluation of a model candidate against the golden dataset, triggered automatically in CI on every training run. |
| Online Evaluation | Nightly asynchronous evaluation of the production model on a stratified sample of real production traffic with joined ground-truth labels. |
| Evaluator | A callable registered in `eval/metrics.py` that accepts (`y_true`, `y_pred`) arrays and returns a scalar score. |
| Example-Level Result | A record storing input, model output, ground truth, per-evaluator scores, and latency for a single example — as opposed to a batch aggregate. |
| Champion Model | The currently deployed production model; its most recent offline aggregate metrics serve as the regression baseline for all challenger candidates. |
| Challenger Model | A newly trained model candidate under evaluation for potential promotion to production. |
| Regression Alert | An alert raised when `challenger_metric < champion_metric − regression_delta[metric]` for any gated metric. |
| Offline↔Online Divergence | The absolute difference between a metric computed on the golden dataset (offline) and the same metric computed on labelled production traffic (online). |
| Human Review Queue | A JSONL store of production examples flagged for manual labelling because they triggered an anomaly condition during online evaluation. |
| Closed-Loop Feedback | The controlled process of promoting human-reviewed and labelled failure examples from the review queue into the offline golden dataset. |
| PSI | Population Stability Index; quantifies input feature distribution shift between the training reference distribution and current serving traffic. |
| Metric Gate | A minimum (or maximum) required metric value defined in `configs/eval_config.yaml`; failing a required gate blocks promotion and exits the CI job with a non-zero code. |

## Out of Scope

- Model training, hyperparameter tuning, and feature engineering — handled by the upstream training pipeline.
- Real-time (synchronous) per-prediction evaluation; online evaluation is always asynchronous batch sampling.
- Evaluation of models producing unstructured media outputs (image generation, audio synthesis, video); this pipeline covers tabular and text output tasks.
- Automated model promotion or registry stage transitions; the pipeline raises alerts and writes reports but never modifies model registry state.
- Human review UI; this pipeline writes to and reads from a flat-file review queue; a separate front-end consumes and updates queue status.

## Requirements

### Requirement 1: Golden Dataset Management

**User Story:** As an ML engineer, I want a versioned, append-only golden dataset with schema validation, SHA-256 integrity checking, and controlled example additions, so that offline evaluation is always reproducible and the dataset cannot silently grow stale or become corrupt.

#### Acceptance Criteria

1. WHEN a new example is added via `python -m eval.datasets add --dataset <name> --record '<json>'`, THE SYSTEM SHALL validate the record against the JSON schema in `configs/golden_schema.json`, assign a monotonically increasing `example_id`, record the `added_at` UTC timestamp and the `added_by` identity from the `KIRO_EVAL_USER` environment variable, and append the record to `data/golden/{dataset_name}.jsonl`.
2. WHEN the golden dataset is loaded for offline evaluation, THE SYSTEM SHALL compute a SHA-256 checksum of the entire `.jsonl` file, compare it against the value stored in `data/golden/{dataset_name}.meta.json`, and raise a `DatasetIntegrityError` halting evaluation if they do not match — ensuring no example was silently added or modified outside the controlled append path.
3. IF the golden dataset contains fewer than 50 examples, THEN THE SYSTEM SHALL emit a `DatasetSizeWarning` to stdout and continue evaluation, because aggregate metrics computed on fewer examples have wider confidence intervals and reduced reliability as CI gates.
4. WHEN examples from the closed-loop feedback process are promoted from the human review queue, THE SYSTEM SHALL add each example to the golden dataset through the same append path as Criterion 1, tag the record with `"source": "online_feedback"` and the original production `prediction_id`, and increment the `feedback_loop_additions` counter in `{dataset_name}.meta.json`.
5. WHERE an incoming example's `input` field hashes (SHA-256 of its JSON-serialised form) to the same value as an existing golden example, THE SYSTEM SHALL skip the write, log a `DuplicateExampleWarning` identifying the conflicting `example_id`, and report the skip count in the command output rather than writing a duplicate.
6. WHEN the `--dry-run` flag is passed to the add command, THE SYSTEM SHALL validate the record against the schema, report any field-level validation errors to stderr, and exit without writing to the dataset file or updating `{dataset_name}.meta.json`.

---

### Requirement 2: Offline Evaluation as a CI Gate

**User Story:** As an ML engineer, I want offline evaluation to execute automatically on every model commit, block promotion when any required metric falls below its configured gate, and raise a regression alert when the challenger underperforms the champion, so that quality regressions never reach production silently.

#### Acceptance Criteria

1. WHEN offline evaluation is triggered via `python -m eval.offline_eval --model-uri <uri> --dataset <name>`, THE SYSTEM SHALL load the golden dataset, run every evaluator listed in `configs/eval_config.yaml` against all examples, write one JSON line per example to `results/offline/{run_id}/example_results.jsonl` containing `example_id`, `model_uri`, `input`, `ground_truth`, `model_output`, `latency_ms`, per-evaluator score dict, and `evaluated_at` UTC timestamp, then compute and write aggregate metrics to `results/offline/{run_id}/aggregate_metrics.json`.
2. WHEN all evaluators have completed, THE SYSTEM SHALL compare each aggregate metric against its configured gate in `configs/eval_config.yaml`; if any required gate is not met, THE SYSTEM SHALL exit with return code 1, write `"gate_passed": false` to `results/offline/{run_id}/summary.json`, and print a structured failure summary to stderr listing each failing metric with its actual value, threshold, and direction — so CI blocks the pull request.
3. WHEN `--champion-uri <uri>` is provided, THE SYSTEM SHALL load aggregate metrics from `results/offline/champion_metrics.json` and raise a `RegressionAlert` for any metric where `challenger_value < champion_value − config.regression_delta[metric]`; the alert payload must include `champion_value`, `challenger_value`, `delta`, `regression_delta_threshold`, `metric_name`, and `run_id`, and must be posted to `KIRO_ALERT_WEBHOOK_URL` within 10 seconds.
4. IF the model specified by `--model-uri` cannot be loaded (missing artefact, schema mismatch, unsupported framework), THEN THE SYSTEM SHALL exit with return code 2 and write a structured error record to `results/offline/{run_id}/summary.json` containing `model_uri`, `exception_type`, `exception_message`, and `failed_at` UTC timestamp.
5. WHILE offline evaluation is running, THE SYSTEM SHALL log a progress line to stdout every 100 examples showing the current count, total count, elapsed seconds, and the running mean of the primary metric, so that a CI runner can detect a stalled evaluation job before `eval.timeout_seconds` fires.
6. WHEN offline evaluation completes with all required gates passed and no regression alert triggered, THE SYSTEM SHALL atomically overwrite `results/offline/champion_metrics.json` with the current run's aggregate metrics and `run_id`, ensuring the file always represents the last passing model and is the baseline for future challengers.
7. WHERE a metric in `configs/eval_config.yaml` is marked `required: false`, THE SYSTEM SHALL compute and include it in the aggregate output and HTML report, but not fail the CI gate if it falls below its threshold — it is treated as informational.

---

### Requirement 3: Evaluator Suite and Metrics

**User Story:** As a data scientist, I want a pluggable evaluator registry with task-specific metrics and configurable thresholds, so that the same pipeline evaluates classifiers, regressors, and ranking models without requiring changes to the core pipeline code.

#### Acceptance Criteria

1. WHEN the evaluation pipeline initialises, THE SYSTEM SHALL resolve all evaluator names listed under `evaluators:` in `configs/eval_config.yaml` against the `EVALUATOR_REGISTRY` in `eval/metrics.py`; if any name is not registered, THE SYSTEM SHALL raise an `UnknownEvaluatorError` listing all unresolved names before processing any examples.
2. WHEN evaluating a binary classifier, THE SYSTEM SHALL compute accuracy, precision, recall, F1 (at the configured operating threshold), AUC-ROC (using `sklearn.metrics.roc_auc_score`), and Average Precision; each computation must return an identical result when run twice with the same inputs and the same fixed random seed, ensuring reproducibility.
3. WHEN evaluating a regression model, THE SYSTEM SHALL compute MAE, RMSE, MAPE (skipping individual examples where `ground_truth == 0` to avoid division by zero and emitting a `MAPEZeroGroundTruthWarning` with the skip count), and R² using `sklearn.metrics.r2_score`.
4. WHEN evaluating a ranking model, THE SYSTEM SHALL compute nDCG@5, nDCG@10, MAP@10, and MRR using `sklearn.metrics.ndcg_score` for nDCG and a local implementation for MAP and MRR.
5. IF a single example's evaluation raises an exception in any evaluator, THEN THE SYSTEM SHALL catch the exception, write `{"score": null, "error": "<ExceptionType>: <message>"}` for that evaluator in the example's result record, log a warning including the `example_id` and evaluator name, and continue to the next example without halting the run.
6. WHERE all examples in the golden dataset belong to a single class (positive rate is 0.0 or 1.0), THE SYSTEM SHALL skip AUC-ROC and Average Precision computation for that run, emit a `DegenerateClassWarning` identifying the dataset name, and mark those metrics as `null` in the aggregate output — preventing a misleadingly high gate pass on degenerate data.

---

### Requirement 4: Example-Level Results and Slice Analysis

**User Story:** As an ML engineer, I want every evaluation result persisted at the example level and queryable with slice filters and run comparison tooling, so that I can identify which input subgroups drive degradation and compare two model runs example by example.

#### Acceptance Criteria

1. WHEN any evaluation run (offline or online) completes, THE SYSTEM SHALL guarantee that `results/{mode}/{run_id}/example_results.jsonl` contains exactly one record per evaluated example, with each line including: `example_id`, `run_id`, `mode`, `model_uri`, `input`, `ground_truth`, `model_output`, `latency_ms`, `scores` dict keyed by evaluator name, and `evaluated_at` UTC timestamp.
2. WHEN a caller runs `python -m eval.results slice --run-id <id> --filter "scores.accuracy == 0"`, THE SYSTEM SHALL parse the filter expression using a safe evaluator (no `eval()` or `exec()`), load the relevant `example_results.jsonl`, apply the filter, and print matching records as line-delimited JSON to stdout.
3. WHEN a caller runs `python -m eval.results compare --run-a <id> --run-b <id>`, THE SYSTEM SHALL join both `example_results.jsonl` files on `example_id`, compute per-example metric deltas for every evaluator present in both runs, and print a summary including: total matched examples, count where run-a is better by more than 0.05, count where run-b is better by more than 0.05, and the 10 largest per-example regressions sorted by absolute delta descending.
4. IF an `example_results.jsonl` record is written with a null `example_id`, THEN THE SYSTEM SHALL reject that write, log the error with the example's position index, and continue to the next example — never writing a record that cannot be matched or filtered.
5. WHEN aggregate metrics are computed from `example_results.jsonl`, THE SYSTEM SHALL also compute and include the p10, p50, and p90 values of `latency_ms` in `aggregate_metrics.json`, so that evaluation throughput regressions are visible alongside accuracy regressions.

---

### Requirement 5: Online Evaluation, Drift Detection, and Divergence Alerting

**User Story:** As an ML engineer, I want nightly online evaluation that samples production traffic, applies the same evaluators as offline, detects input distribution drift, and alerts when online metrics diverge significantly from offline metrics, so that silent model degradation in production is caught promptly.

#### Acceptance Criteria

1. WHEN the online evaluation job runs (nightly, triggered by the scheduler), THE SYSTEM SHALL load prediction logs from `logs/predictions_*.jsonl` for the preceding 24-hour window, draw a stratified random sample of up to `config.online_sample_size` (default 5 000) examples stratified on `model_output` decile, join ground-truth labels from the label store configured in `configs/online_eval.yaml`, and run the full evaluator suite on labelled examples only.
2. WHEN online evaluators complete, THE SYSTEM SHALL compare each online aggregate metric against the corresponding value in `results/offline/champion_metrics.json`; for any metric where `|online_value − offline_value| > config.divergence_threshold[metric]` (default 0.05), THE SYSTEM SHALL post a `DivergenceAlert` payload to `KIRO_ALERT_WEBHOOK_URL` containing `metric_name`, `online_value`, `offline_value`, `divergence`, `threshold`, and `run_id`.
3. WHEN PSI is computed for each input feature using reference distributions from `models/reference_stats.json` (written at training time), THE SYSTEM SHALL classify features with PSI > 0.2 as `high_drift` and PSI 0.1–0.2 as `moderate_drift`, set `drift_detected: true` in the online run summary if any feature is `high_drift`, and include drifted feature names in the `DivergenceAlert` payload when divergence and drift co-occur.
4. WHEN an online example does not have a ground-truth label available in the label store, THE SYSTEM SHALL record it as `{"labelled": false}` in the sample log and exclude it from metric computation, reporting the labelled fraction in `results/online/{run_id}/summary.json`.
5. IF the fraction of labelled examples in the online sample falls below 30 %, THEN THE SYSTEM SHALL emit a `LowLabelCoverageWarning`, compute metrics on the available labelled subset, and set `low_label_coverage: true` in the summary so downstream dashboards can flag potentially unreliable metric estimates.
6. WHEN an online example's primary metric score is in the bottom 5th percentile of the offline score distribution for that metric AND the model's top predicted class probability is below `config.anomaly_confidence_gap` (default 0.1 gap to second class), THE SYSTEM SHALL write the example to `data/review_queue/{run_id}.jsonl`, capped at `config.max_review_items_per_run` (default 200) to avoid flooding human reviewers.

---

### Requirement 6: Closed-Loop Feedback into the Golden Dataset

**User Story:** As an ML engineer, I want confirmed failure examples from the human review queue to be automatically promotable into the offline golden dataset, so that the golden set grows to cover real production failures and the CI gate becomes harder to game over time.

#### Acceptance Criteria

1. WHEN a batch promotion run is triggered via `python -m eval.datasets promote-queue --dataset <name> --approved-by <reviewer>`, THE SYSTEM SHALL process all items in `data/review_queue/` with status `confirmed_failure`, validate each against the golden schema, append each passing item to the golden dataset with `source: "online_feedback"` and the original `prediction_id`, and mark each queue item as `promoted: true` with the promoter identity and UTC timestamp.
2. WHEN a batch promotion run completes, THE SYSTEM SHALL print a promotion report listing: total items examined, examples promoted, examples rejected (schema errors), and examples skipped as duplicates.
3. IF a review queue item has `status: "rejected"` (set by the human reviewer), THEN THE SYSTEM SHALL mark it `archived: true` and skip it in all future promotion runs without deleting the record, preserving the audit trail for quality analysis.
4. WHEN closed-loop promotion adds at least one new example to the golden dataset, THE SYSTEM SHALL automatically re-run offline evaluation for the champion model URI recorded in `results/offline/champion_metrics.json`, so that `champion_metrics.json` is refreshed against the expanded dataset and the baseline remains current.
5. WHERE the same example's `input` hash already exists in the golden dataset, THE SYSTEM SHALL skip the add, emit a `DuplicateExampleWarning`, and count it under `examples_skipped_as_duplicates` in the promotion report.

---

### Requirement 7: Regression Alerting, HTML Reporting, and Non-Functional Constraints

**User Story:** As an ML engineer, I want structured regression alerts posted to a webhook and an HTML evaluation report generated after every offline run, with bounded evaluation time so CI is not blocked, so that regressions are actionable within minutes and the pipeline cost scales predictably.

#### Acceptance Criteria

1. WHEN a `RegressionAlert` is raised (per R2.3), THE SYSTEM SHALL post a JSON payload to `KIRO_ALERT_WEBHOOK_URL` within 10 seconds, containing: `alert_type: "REGRESSION_ALERT"`, `run_id`, `model_uri`, `champion_uri`, `metric_name`, `challenger_value`, `champion_value`, `delta`, `regression_delta_threshold`, and `evaluated_at`; if the POST fails, THE SYSTEM SHALL retry once after 3 seconds and on second failure write the payload to `logs/alerts.jsonl`.
2. WHEN an offline evaluation run completes (pass or fail), THE SYSTEM SHALL render an HTML report at `reports/offline/{run_id}.html` using a Jinja2 template embedding: the aggregate metric table with per-metric gate status, regression comparison rows (if champion was provided), a histogram of `latency_ms` across all examples, and a table of the 20 worst-scoring examples with their inputs and scores.
3. IF `KIRO_ALERT_WEBHOOK_URL` is not set or is an empty string, THEN THE SYSTEM SHALL write all alert payloads as JSON lines to `logs/alerts.jsonl` instead of attempting any HTTP request, so that alerts are never silently dropped in environments without a configured webhook.
4. WHEN evaluating a golden dataset of up to 10 000 examples with a model whose p95 per-example inference latency is below 500 ms, THE SYSTEM SHALL complete the full offline evaluation run — including evaluator computation and report rendering — within `eval.timeout_seconds` (default 300 s) on a single CPU core.
5. WHEN a model's outputs are deterministic for identical inputs (no sampling, no external state), THE SYSTEM SHALL produce identical aggregate metrics and identical `example_results.jsonl` content on two consecutive runs against the same dataset version and model URI, so that reproducibility is a CI-verifiable property.
