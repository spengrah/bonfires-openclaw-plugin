# Verification Matrix — Wave 11 ContextEngine Phases X/Y

| Requirement / Criterion | Verification command/check | Pass condition | Artifact |
|---|---|---|---|
| PM20 spec exists and defines `afterTurn()` writeback migration | Manual doc review | Spec includes native post-turn writeback + fail-open behavior | `.ai/spec/spec/context-engine/after-turn-episodic-memory-writeback.md` |
| PM21 migration boundary is explicit | Manual doc review | Spec/guidance clearly exclude explicit content-ingestion migration and duplicate-write risk | `.ai/spec/spec/context-engine/after-turn-episodic-memory-writeback.md` |
| PM22 spec exists and defines `assemble()` retrieval migration | Manual doc review | Spec includes `/delve` mapping + fail-open retrieval semantics | `.ai/spec/spec/context-engine/assemble-delve-retrieval.md` |
| PM23 compatibility defaults are explicit | Manual doc review | Spec/guidance keep per-turn recall off/opt-in and address duplicate injection risk | `.ai/spec/spec/context-engine/assemble-delve-retrieval.md` |
| Requirements index mapping complete | `grep -n "PM20\|PM21\|PM22\|PM23" .ai/spec/spec/requirements-index.md` | All four entries present with correct spec/guidance pointers | `.ai/spec/spec/requirements-index.md` |
| Traceability updated | `grep -n '"PM20"\|"PM21"\|"PM22"\|"PM23"' .ai/spec/spec/quality/traceability-map.json` | All four IDs mapped with verification links | `.ai/spec/spec/quality/traceability-map.json` |
| Architecture sketch reconciled with clarified invocation semantics | Manual doc review | Sketch no longer implies `ingest()`/`ingestBatch()` are primary doc-ingestion migration targets and clearly separates PM20/PM21 from PM22/PM23 runtime responsibilities | `.ai/log/plan/context-engine-bonfires-architecture-sketch-20260308.md` |
| PM20/PM21 active wiring expectation is explicit | Manual doc review | Spec/guidance require `afterTurn()` active registration and `agent_end` deactivation | `.ai/spec/spec/context-engine/after-turn-episodic-memory-writeback.md` |
| PM22/PM23 active wiring expectation is explicit | Manual doc review | Spec/guidance require `assemble()` active registration and `before_agent_start` deactivation, with no mixed active retrieval mode | `.ai/spec/spec/context-engine/assemble-delve-retrieval.md` |
| Stable-guidance vs dynamic-retrieval ownership boundary is explicit | Manual doc review | Planning artifacts keep PM18/PM19-owned `prependSystemContext` guidance distinct from PM22/PM23 retrieval responsibilities | `.ai/spec/spec/context-engine/assemble-delve-retrieval.md` |
| PM20–PM23 test plan is robust enough for migration work | Manual doc review | Planning artifacts define tests for fail-open behavior, duplicate-prevention, migration boundaries, default-off compatibility, and inactive-legacy-hook expectations | `.ai/log/plan/wave-11-plan-context-engine-phases-x-y-20260308.md` |
