# Verification Matrix — Wave 9 PM16/PM17 Planning

| Requirement / Criterion | Verification command/check | Pass condition | Artifact |
|---|---|---|---|
| PM16/PM17 spec exists and is coherent | Manual doc review | Spec defines flow, tools, defaults, safety, preconditions | `.ai/spec/spec/ingestion/approval-gated-link-ingestion-and-discovery.md` |
| Guidance exists and matches spec boundaries | Manual doc review | Guidance enforces reuse-first + non-blocking hook path | `.ai/spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md` |
| Requirements index includes PM16/PM17 | `grep -n "PM16\|PM17" .ai/spec/spec/requirements-index.md` | Both entries present with spec+guidance pointers | `.ai/spec/spec/requirements-index.md` |
| PM17 remains feature-flagged by policy | Manual doc review of spec+guidance | Both docs explicitly state PM17 is feature-flagged and remains disabled until PM16 production validation is complete | spec + guidance |
| PM14/PM15 production gate is explicit and evidenced | Artifact review | Kickoff package cites `.ai/log/plan/pm14-pm15-production-validation-20260308.md`, `.ai/log/review/review-verification-quality-20260307w9-remediation.md`, and `.ai/log/review/review-correctness-20260307w9-remediation.md` as required precondition evidence | wave plan + spec + review support |
| Non-blocking constraint preserved | Manual doc review of canonical flow + implementation guidance | `before_agent_start` is limited to link detection + compact instruction injection; docs do not permit heavy fetch/discovery/ingestion work in hook path | spec + guidance |
| Approval-bound ingestion required | Manual doc review of tool contract + canonical flow | docs require explicit approval before Bonfires ingestion, require a turn-local `approvalToken`, and define the token-resolved approved URL set as the only executable ingest set | spec |
| Approval provenance binding required | Manual doc review of spec+guidance | docs explicitly reject caller-asserted approval as sufficient and require session-local approval-token verification before execution | spec + guidance |
| Approval policy scope matches product decision | Manual doc review of spec+guidance + plan | docs explicitly allow same-session reuse of already approved URL sets and do not require exact-turn single-use semantics | spec + guidance + wave plan |
| Option 1 rejection paths are explicit | Manual doc review of spec+guidance + plan | missing, expired, cross-session, unverifiable, or bypass-style approval inputs are documented as fail-closed conditions | spec + guidance + wave plan |
| Discovery-disabled-by-default kickoff gate is explicit | Manual doc review of rollout policy + preconditions | PM17 cannot be treated as enabled for implementation rollout until PM16 validation evidence is present | spec + guidance + wave plan |
| Review support docs present | File existence check | Review checklist and risk notes available | `.ai/log/plan/review-support-wave-9-1c-ab-20260308.md` |
