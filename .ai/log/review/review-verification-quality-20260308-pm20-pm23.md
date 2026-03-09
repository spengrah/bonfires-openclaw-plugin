# Verification Quality Review — PM20 / PM21 / PM22 / PM23

- Project: bonfires-plugin
- Lens: Verification Quality
- Date: 2026-03-08
- Reviewer invocation included `delta.git_diff`: `.ai/log/review/delta-pm20-pm23-implementation-20260308.patch`

## Verdict
CONDITIONAL_GO

## Confidence
medium

## Deterministic checks
- pass — targeted artifact inspection completed across plan/spec/guidance/code/tests
- pass — PM20/PM21/PM22/PM23 requirements exist in requirements index
- pass — PM20/PM21/PM22/PM23 entries exist in traceability map
- pass — implementation adds `src/context-engine.ts` and plugin registration for `registerContextEngine('bonfires', ...)`
- pass — runtime registration test asserts legacy `before_agent_start` / `agent_end` hooks are not registered
- pass — runtime tests cover default-off retrieval, explicit enablement, and fail-open retrieval/capture behavior
- pass — local test run completed successfully (`npm test -- --test-name-pattern='PM20|PM21|PM22|PM23' tests/wave15-pm20-pm23.test.ts`), though the package command effectively exercised the full suite and passed
- fail — `tests/REQUIREMENT-MAPPING.md` does not yet map PM20/PM21/PM22/PM23 tests, so test-to-requirement traceability for this wave is incomplete

## Blocking findings
1. **Test-to-requirement traceability is incomplete for this wave.**
   - `tests/wave15-pm20-pm23.test.ts` exists and covers the major behaviors, but `tests/REQUIREMENT-MAPPING.md` stops at PM19 and does not map PM20–PM23.
   - That weakens the explicit verification chain for `problem:bonfires-plugin:verify-spec-guidance-traceability-coherence`, because the spec/index/traceability artifacts were updated but the human-readable test mapping artifact was not kept in sync.

## Non-blocking findings
1. **Core coverage is directionally good.**
   - PM20: tested post-turn delta slicing via `prePromptMessageCount`.
   - PM21: tested fail-open capture behavior and registration-level deactivation of `agent_end`.
   - PM22/PM23: tested default-off dynamic retrieval, explicit enablement, retrieval fail-open, and registration-level deactivation of `before_agent_start`.

2. **Stable-guidance vs dynamic-retrieval ownership remains reasonably verifiable.**
   - `assemble()` returns stable guidance through `systemPromptAddition` and places dynamic retrieval into an injected system message, matching the spec boundary.
   - The wave15 tests explicitly assert stable guidance persists when retrieval is off and remains separate when retrieval is on.

3. **One additional regression test would improve migration-boundary confidence, but I do not consider it merge-blocking.**
   - There is no direct assertion that `session_end` does not duplicate a turn already captured by `afterTurn()` after ledger advancement in a realistic end-to-end sequence.
   - Existing shared-ledger behavior strongly suggests this is safe, but an explicit migration-boundary test would make the deactivation/ownership story crisper.

## Required before merge
1. Update `tests/REQUIREMENT-MAPPING.md` to add explicit PM20 / PM21 / PM22 / PM23 mappings for `tests/wave15-pm20-pm23.test.ts`.

## Rationale
Verification quality is mostly solid: the implementation is covered at the behavior level for the new ContextEngine surfaces, the legacy hook deactivation expectation is tested at registration time, and the important default-off/fail-open/stable-vs-dynamic boundaries are exercised. The remaining gap is traceability coherence: this wave added specs, guidance, requirements-index entries, traceability-map entries, and tests, but did not finish the corresponding test-mapping artifact for PM20–PM23. That is small to fix, but important enough to require before merge because this review lens is specifically about verification completeness and traceable coverage.
