# Wave 3 Review — Security/Attacker

## 1) Verdict
GO — confidence: medium-high

## 2) Blocking findings
- None.

## 3) Non-blocking findings
- Hosted retry classification includes message-pattern matching (`abort|network|fetch|timeout`) which is broad; this is acceptable for fail-open behavior but should be monitored to avoid retrying opaque non-network failures that contain matching text.
- `recoverySource` input shape is trusted at integration boundary; malformed session payloads are mostly fail-closed by guards, but there is no explicit schema validation layer at this boundary.

## 4) Required remediations
- None required for this wave.

## 5) Proof of review
- **Commands run:**
  - `npm run gate:all`
  - `npm run gate:diff-escalation`
  - `npm run gate:anti-gaming`
  - `read` on `src/bonfires-client.ts`, `src/heartbeat.ts`, `src/hooks.ts`, and tests.
- **Artifacts inspected:**
  - `.ai/log/review/diff-wave-3-5abc7f4.patch`
  - `.ai/log/plan/verification-gates-report-current.json`
  - Hosted/recovery/heartbeat spec+guidance docs.
- **Why this lens fits:** wave scope includes hosted HTTP behavior, retries, and recovery logic touching persisted transcript data; these are attacker-relevant boundaries.
- **Anti-gaming observations:** escalation and anti-gaming gates passed with sensitive-file detection active; tests include negative paths for strict-hosted mode and fail-open recovery behavior.

## 6) Diff acknowledgement
Reviewed the full Wave 3 implementation diff at `5abc7f4`, with emphasis on hosted fetch/retry logic and recovery/ledger interaction paths.