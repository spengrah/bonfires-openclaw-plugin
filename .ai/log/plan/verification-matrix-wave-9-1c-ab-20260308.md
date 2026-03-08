# Verification Matrix — Wave 9 PM16/PM17 Planning

| Requirement / Criterion | Verification command/check | Pass condition | Artifact |
|---|---|---|---|
| PM16/PM17 spec exists and is coherent | Manual doc review | Spec defines flow, tools, defaults, safety, preconditions | `.ai/spec/spec/ingestion/approval-gated-link-ingestion-and-discovery.md` |
| Guidance exists and matches spec boundaries | Manual doc review | Guidance enforces reuse-first + non-blocking hook path | `.ai/spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md` |
| Requirements index includes PM16/PM17 | `grep -n "PM16\|PM17" .ai/spec/spec/requirements-index.md` | Both entries present with spec+guidance pointers | `.ai/spec/spec/requirements-index.md` |
| PM17 remains feature-flagged by policy | Plan review checklist | Docs explicitly state flag-off default until PM16 validation | wave plan + spec |
| PM14/PM15 production gate is explicit | Plan review checklist | Hard precondition documented before implementation | wave plan + spec |
| Non-blocking constraint preserved | Architecture review | Hook path avoids heavy network ingestion | spec + guidance |
| Approval-bound ingestion required | Architecture review | Only explicitly approved URLs may be ingested | spec |
| Review support docs present | File existence check | Review checklist and risk notes available | `.ai/log/plan/review-support-wave-9-1c-ab-20260308.md` |
