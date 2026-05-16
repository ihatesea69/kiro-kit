---
name: debugging
description: Systematic debugging framework for data and ML code. Use when encountering bugs, test failures, unexpected model behavior, or data quality issues.
---

# Debugging

Activate this skill when investigating bugs, failures, or unexpected behavior.

## When to Use

- Model producing unexpected predictions
- Data pipeline failures or data quality issues
- Test failures in ML code
- Performance degradation in production
- Memory or compute resource issues

## Process

1. **Reproduce**: Isolate the minimal case that triggers the issue
2. **Observe**: Gather evidence (logs, metrics, data samples)
3. **Hypothesize**: Form testable theories about root cause
4. **Test**: Validate or eliminate each hypothesis
5. **Fix**: Apply targeted fix based on confirmed root cause
6. **Verify**: Confirm fix resolves issue without side effects

## Common ML Debugging

- **NaN loss**: Check for division by zero, log(0), extreme values
- **No convergence**: Reduce learning rate, check data normalization
- **Overfitting**: Add regularization, reduce model capacity
- **Data leakage**: Verify train/test split happens before preprocessing
- **Shape mismatch**: Print tensor shapes at each layer

## Rules

- Never fix without understanding root cause
- Add assertions/tests to prevent regression
- Check data first (garbage in, garbage out)
- Use deterministic seeds when debugging randomness
- Document the fix and why it works

