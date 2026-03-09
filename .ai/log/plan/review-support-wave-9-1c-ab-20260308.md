# Review Support — Wave 9 PM16/PM17

## Reviewer focus areas
1. **Correctness boundaries**
   - Is discovery generic and ingestion Bonfires-specific?
   - Is approval scope explicit and enforceable?
   - Is the token-resolved approved URL set the only executable ingest set?
2. **Security boundary**
   - Is approval provenance tool-verifiable rather than caller-asserted?
   - Are missing/expired/cross-session/unverifiable token paths fail-closed?
   - Does the review align to accepted product policy that session-scoped approval is sufficient?
3. **Latency safety**
   - Does plan avoid heavy work in `before_agent_start`?
4. **Reuse discipline**
   - Does plan reuse PM15 transport safety + ingestion core?
5. **Rollout safety**
   - Is PM17 clearly feature-flagged pending PM16 production validation?

## Blocking findings (NO_GO)
1. Any path that performs heavy fetch/ingest in `before_agent_start`.
2. Any ingestion path not bound to explicit user approval.
2a. Any contract that allows execution without a verifiable approval token resolving to the sole executable ingest set.
2b. Any design that treats caller-supplied approval assertions as sufficient provenance for execution.
2c. Do not require exact-turn binding or single-use token semantics unless product policy explicitly requires them.
3. Discovery enabled by default without PM16 validation gate.
4. Missing PM14/PM15 production validation precondition.

## Conditional findings (CONDITIONAL_GO)
1. Defaults need tuning but safety envelope intact.
2. Metadata fields incomplete but contracts are stable.
3. Observability fields incomplete but can be added before merge.

## Required artifacts for implementation kickoff
1. PM14/PM15 production validation record: `.ai/log/plan/pm14-pm15-production-validation-20260308.md`.
2. PM14/PM15 remediation Verification Quality review: `.ai/log/review/review-verification-quality-20260307w9-remediation.md`.
3. PM14/PM15 remediation Correctness review: `.ai/log/review/review-correctness-20260307w9-remediation.md`.
4. Accepted PM16/PM17 spec and guidance docs.
5. Accepted verification matrix.
