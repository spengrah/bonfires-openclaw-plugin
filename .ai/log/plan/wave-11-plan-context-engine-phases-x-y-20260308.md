# Wave 11 Plan — ContextEngine PM20 / PM21 / PM22 / PM23

Date: 2026-03-08  
Status: Planning only

## Intent / end state
Define the next Bonfires/OpenClaw ContextEngine requirements after PM18/PM19:
1. **PM20 / PM21** — migrate episodic memory stack writeback to `ContextEngine.afterTurn()` with a clear legacy-boundary/deactivation contract.
2. **PM22 / PM23** — migrate Bonfires turn-time retrieval to `ContextEngine.assemble()` with explicit compatibility defaults and legacy-boundary/deactivation contract.

## Goals
1. Align Bonfires lifecycle integration with native OpenClaw ContextEngine invocation timing.
2. Preserve explicit content-ingestion architecture as a Bonfires-native subsystem.
3. Keep retrieval reintroduction optional and backward compatible.

## Non-goals
1. No implementation in this planning wave.
2. No migration of explicit document/PDF/link ingestion into `ingest()`/`ingestBatch()`.
3. No compaction/subagent ContextEngine adoption in this wave.

## Work breakdown
1. PM20/PM21 spec/guidance for `afterTurn()` writeback — complete.
2. PM22/PM23 spec/guidance for `assemble()` retrieval — complete.
3. Index/traceability updates — complete.
4. Verification matrix + architecture-sketch reconciliation — next.
5. Robust implementation test plan covering migration boundaries, fail-open behavior, duplicate-prevention, and default-off compatibility — next.

## Verification strategy summary
- deterministic artifact presence checks
- requirements/traceability mapping checks
- manual architecture consistency review against upstream invocation semantics

## Risks to carry forward
1. prompt-boundary drift between stable guidance and dynamic snippets,
2. hidden coupling with watermark/recovery helpers,
3. hidden coupling in retrieval wiring when `before_agent_start` is deactivated,
4. inactive legacy code drifting out of sync with active paths if retained too long.

## Remaining planning needed before implementation
1. Revalidate baseline green immediately before implementation kickoff.
2. Confirm implementation readiness at the planning level only; lower-level design stays with the implementer agent.

## Decision gates
- GO: specs/guidance/traceability complete, architecture reconciled, and test plan is strong enough for implementation
- CONDITIONAL_GO: wording clarifications remain but architecture and tests are sound
- NO_GO: scope ambiguity, conflicting migration semantics, or weak migration-boundary tests remain

## Implementation-readiness status
PM20–PM23 are planning-ready for implementation once baseline green is revalidated at kickoff. Locked design assumptions are:
1. `afterTurn()` hard-replaces active `agent_end` episodic writeback with no mixed-mode.
2. `assemble()` hard-replaces active `before_agent_start` dynamic retrieval when enabled, while remaining default-off until intentionally enabled.
3. PM18/PM19-owned stable guidance in `prependSystemContext` remains distinct from PM22/PM23 dynamic retrieval responsibilities.
4. Legacy hook code may remain in-tree, but inactive.
