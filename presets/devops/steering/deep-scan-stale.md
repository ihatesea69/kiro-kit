---
inclusion: manual
---

# Deep Scan Stale

Run on demand to check whether the last deep security scan is stale (>30 days) or predates significant source changes.

Check the freshness of the last deep security scan. Find the most recent directory under .kiro/security/scans/ and read its report.md and findings.json. Report: the scan date and how many days old it is; the count of findings still marked status: open by severity; and whether source files have changed materially since the scan (use git log since that date, ignoring docs and tests). Recommend a re-scan if the scan is older than 30 days, if open CRITICAL or HIGH findings remain, or if changes since the scan touched files listed in any open finding — and say which scoped path to re-scan with /security:deep-scan. If no scan directory exists, say so and recommend an initial full scan. Do not modify any files.
