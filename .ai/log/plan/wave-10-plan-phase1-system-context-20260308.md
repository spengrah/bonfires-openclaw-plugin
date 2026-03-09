# Wave 10 Plan — Phase 1 (PM18/PM19) System Context + Policy Fallback

Date: 2026-03-08  
Status: Plan phase (implementation not started)

## Intent / end state
Implement a small compatibility wave for OpenClaw v2026.3.7 that:
1. allows stable Bonfires guidance to be placed in system-context fields,
2. remains robust when prompt injection is constrained by policy.

## Goals
1. Reduce repeated prompt-token overhead for stable guidance.
2. Preserve fail-open retrieval behavior under stricter policy.
3. Keep changes low-risk and backward compatible.

## Non-goals
1. ContextEngine integration/migration.
2. Ingestion architecture changes.
3. Compaction/writeback redesign.

## Work breakdown
1. Spec/guidance updates (PM18/PM19) — complete.
2. Verification + review-support planning artifacts — complete.
3. Robust implementation test plan and implementation-readiness pass — next.

## Assumption checks
1. Baseline is green: must be revalidated before implementation.
2. Small diff, non-trivial risk: prompt-placement effects require test coverage.
3. Existing PM15 review artifacts are not sufficient for PM18/PM19 coverage.
4. Hook checks alone are not enough; require targeted unit tests for policy-constrained paths.

## Verification strategy summary
- Deterministic checks:
  - `npm run lint`
  - `npm run test`
  - requirements/traceability artifact presence checks
- Targeted checks:
  - system-context field emission tests,
  - default behavior preservation tests,
  - policy-constrained fail-open tests,
  - mixed-mode tests proving stable guidance and dynamic retrieval content do not collide or duplicate when both paths are enabled.

## Remaining planning needed before implementation
1. Finalize a robust PM18/PM19 test plan mapped to acceptance criteria and reviewer concerns. — complete in planning artifacts
2. Revalidate baseline green immediately before implementation kickoff.
3. Confirm implementation readiness at the planning level only; lower-level design stays with the implementer agent.

## Implementation-readiness status
PM18/PM19 are planning-ready for implementation once baseline green is revalidated at kickoff; no further planner-level implementation design is required.

## Back-pressure logic
Block implementation/merge if any of the following occur:
1. Regression in existing test suite.
2. Missing tests for PM18/PM19 acceptance criteria.
3. Any behavior that can abort a turn due to policy-constrained prompt mutation.
4. Scope creep into ContextEngine or ingestion redesign.

Escalation target: Spencer (scope/policy decision).

## Decision gates
- GO: all required checks pass; PM18/PM19 scope respected.
- CONDITIONAL_GO: checks pass but reviewer requests bounded remediations.
- NO_GO: any required gate fails or safety/compat constraints are violated.

## Lens selection and order
1. Verification Quality
2. Correctness
3. Security/Attacker

## Artifacts produced in this phase
1. `.ai/spec/spec/retrieval/system-context-injection-and-prompt-policy-fallback.md`
2. `.ai/spec/guidance/retrieval/guidance-for-system-context-injection-and-prompt-policy-fallback.md`
3. `.ai/spec/spec/requirements-index.md` (PM18/PM19 entries)
4. `.ai/spec/spec/quality/traceability-map.json` (PM18/PM19 traceability)
5. `.ai/log/plan/verification-matrix-wave-10-phase1-system-context-20260308.md`
6. `.ai/log/plan/review-support-wave-10-phase1-system-context-20260308.md`
