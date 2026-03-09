# Verification Matrix — Wave 10 PM18/PM19 (Phase 1)

| Requirement / Criterion | Verification command/check | Pass condition | Artifact |
|---|---|---|---|
| PM18 spec exists and defines system-context behavior | Manual doc review | Spec includes stable-guidance placement + compatibility rules | `.ai/spec/spec/retrieval/system-context-injection-and-prompt-policy-fallback.md` |
| PM19 spec exists and defines fail-open policy handling | Manual doc review | Spec includes policy-constrained no-op behavior and no turn abort | `.ai/spec/spec/retrieval/system-context-injection-and-prompt-policy-fallback.md` |
| Guidance aligns to PM18/PM19 boundaries | Manual doc review | Guidance enforces narrow phase scope and test expectations | `.ai/spec/guidance/retrieval/guidance-for-system-context-injection-and-prompt-policy-fallback.md` |
| Requirements index mapping complete | `grep -n "PM18\|PM19" .ai/spec/spec/requirements-index.md` | PM18 + PM19 entries present with spec/guidance pointers | `.ai/spec/spec/requirements-index.md` |
| Traceability updated | `grep -n '"PM18"\|"PM19"' .ai/spec/spec/quality/traceability-map.json` | PM18 + PM19 mapped with verification links | `.ai/spec/spec/quality/traceability-map.json` |
| Baseline quality gates | `npm run lint && npm run test` | Both pass | CI/local run logs |
| System-context emission behavior | Unit tests (new/updated) | Stable Bonfires guidance is emitted in `prependSystemContext` as the active PM18 path | test files + run log |
| Stable-guidance legacy-path removal is verified | Unit tests (new/updated) | Stable Bonfires guidance is not redundantly emitted in `prependContext` once PM18 behavior is enabled | test files + run log |
| Policy-constrained prompt-injection path is fail-open | Unit tests (new/updated) | No throw/no turn abort/no malformed output; plugin degrades to no-op context injection when mutation is constrained | test files + run log |
| Stable-guidance + dynamic-context boundary is deterministic | Unit tests (new/updated) | Stable guidance remains in system-context field while dynamic retrieval remains separately formatted; no accidental duplication/collision across fields | test files + run log |
| Mixed-mode compatibility is preserved | Unit tests (new/updated) | Enabling system-context placement does not regress URL-detection guidance, Bonfires retrieval formatting, or empty-result behavior | test files + run log |
| Diagnostics remain concise and structured on fallback paths | Unit tests and/or logger assertions (new/updated) | Policy-constrained and retrieval-failure paths emit bounded diagnostics without throwing | test files + run log |
