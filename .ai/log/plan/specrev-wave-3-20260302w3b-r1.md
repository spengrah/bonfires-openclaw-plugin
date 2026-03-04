# Spec Review Summary — Wave 3 (20260302w3b-r1)

## Verdict
GO

## Blocking findings
None.

## Non-blocking findings
1. Hosted strict-mode guard should be explicitly documented as taking precedence over mock fallback in non-dev hosted contexts to avoid future interpretation drift.
2. Retry policy language is split across heartbeat and hosted API docs; future cleanup should centralize retriable status classes and per-endpoint applicability in one cross-reference section.
3. Recovery spec references heartbeat scanning and ledger ownership clearly, but test naming conventions for overlap/dedupe scenarios could be tightened for reviewer traceability.

## Required remediations
1. During implementation, include/update tests that explicitly prove strict-mode no-fallback behavior in non-dev contexts.
2. During implementation, include/update tests that cover retriable vs non-retriable hosted responses for the touched flows.
3. After implementation (or in next doc maintenance pass), add a short cross-reference note linking PM1/PM2 and R4 retry/recovery rules.

## Diff/spec acknowledgement
Reviewed inputs:
- `.ai/log/plan/wave-3-plan-20260302w3b.md`
- `.ai/log/plan/verification-matrix-wave-3-20260302w3b.md`
- `.ai/spec/spec/conversation-memory/stack-processing-heartbeat.md`
- `.ai/spec/guidance/conversation-memory/guidance-for-stack-processing-heartbeat.md`
- `.ai/spec/spec/plugin/spec-for-recovery-catchup-and-session-end-flush.md`
- `.ai/spec/guidance/plugin/guidance-for-recovery-catchup-and-session-end-flush.md`
- `.ai/spec/spec/hosted-integration/hosted-api-wiring.md`
- `.ai/spec/guidance/hosted-integration/guidance-for-hosted-api-wiring.md`
- `.ai/spec/spec/functionality/requirements-index.md`
- `.ai/spec/spec/plugin/requirements-index.md`

Delta acknowledgement:
- Wave 3 planning docs now normalize cadence language to fixed 20-minute base + 0–120s jitter and map wave criteria to runnable gates.
