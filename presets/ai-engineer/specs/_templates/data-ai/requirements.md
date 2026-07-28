# Requirements: [Feature Name]

## Overview

Brief description of the data/ML feature and its purpose.

## User Stories

- As a data scientist, I want to [action] so that [benefit]
- As an ML engineer, I want to [action] so that [benefit]

## Functional Requirements

### Data
- [ ] Input data sources identified and accessible
- [ ] Data schema defined and validated
- [ ] Missing value handling strategy documented
- [ ] Data volume and refresh frequency specified

### Model/Pipeline
- [ ] [Describe model or pipeline behavior]
- [ ] [Describe input/output contract]
- [ ] [Describe performance requirements]

### Reproducibility
- [ ] Random seeds documented
- [ ] Environment dependencies pinned
- [ ] Data versioning in place
- [ ] Configuration externalized (no hardcoded values)

## Non-Functional Requirements

- [ ] Training completes within [time] on [hardware]
- [ ] Inference latency under [X]ms at p95
- [ ] Memory usage under [X]GB during training
- [ ] Pipeline idempotent (safe to re-run)

## Success Metrics

- [ ] [Metric name] >= [threshold] (e.g., F1 >= 0.85)
- [ ] [Metric name] <= [threshold] (e.g., latency <= 100ms)
- [ ] [Baseline comparison] (e.g., +5% over current model)

## Acceptance Criteria

1. [Specific, testable criterion]
2. [Specific, testable criterion]
3. [Specific, testable criterion]

