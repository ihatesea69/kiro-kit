---
name: code-review
description: Structured code review practices for receiving feedback, requesting reviews, and verification gates. Use when reviewing or receiving review feedback on code changes.
---

# Code Review

Activate this skill when performing or receiving code reviews.

## When to Use

- Receiving code review feedback
- Completing tasks requiring review before proceeding
- Before making completion claims about implementations
- Requesting reviews via subagent workflows

## Receiving Feedback

- Apply technical rigor over performative agreement
- If feedback is unclear, ask for clarification with specific questions
- If feedback is technically questionable, explain your reasoning
- Never change code just to appease a reviewer without understanding why

## Requesting Reviews

- Provide context: what changed, why, and what to focus on
- Highlight areas of uncertainty or risk
- Include test results and verification evidence
- Note any trade-offs or decisions made

## Verification Gates

Before claiming work is complete:
- Run the test suite and confirm passing
- Verify the build succeeds
- Check for type errors and lint warnings
- Confirm the change addresses the original requirement
- Provide evidence of verification (command output, test results)

## Rules

- Never claim completion without evidence
- Honest feedback is more valuable than agreement
- Focus on correctness, security, and maintainability
- Style preferences are lower priority than functional issues
