# Review Support — Wave 9 PM16/PM17

## Reviewer focus areas
1. **Correctness boundaries**
   - Is discovery generic and ingestion Bonfires-specific?
   - Is approval scope explicit and enforceable?
2. **Latency safety**
   - Does plan avoid heavy work in `before_agent_start`?
3. **Reuse discipline**
   - Does plan reuse PM15 transport safety + ingestion core?
4. **Rollout safety**
   - Is PM17 clearly feature-flagged pending PM16 production validation?

## Blocking findings (NO_GO)
1. Any path that performs heavy fetch/ingest in `before_agent_start`.
2. Any ingestion path not bound to explicit user approval.
3. Discovery enabled by default without PM16 validation gate.
4. Missing PM14/PM15 production validation precondition.

## Conditional findings (CONDITIONAL_GO)
1. Defaults need tuning but safety envelope intact.
2. Metadata fields incomplete but contracts are stable.
3. Observability fields incomplete but can be added before merge.

## Required artifacts for implementation kickoff
1. PM14 production validation record.
2. PM15 production validation record.
3. Accepted PM16/PM17 spec and guidance docs.
4. Accepted verification matrix.
