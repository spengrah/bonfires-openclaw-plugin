# Spec: Verification Gates Quality v1

Status: Draft
Owner: Lyle + Spencer

## Objective
Define robust, non-flimsy verification gates that block low-quality changes even when superficial lint/tests pass.

## Scope
Applies to all `/dev` waves for `bonfires-plugin` starting next wave.

## Requirements

### G1 — Required gate tiers
Each wave must define and run all required tiers:
1. Tier 1: static hygiene (`lint`, formatting, type checks when applicable)
2. Tier 2: behavioral correctness (unit/integration tests)
3. Tier 3: adversarial/negative-path checks (error and edge cases)
4. Tier 4: traceability integrity (requirements -> tests/artifacts mapping)

A missing required tier is a gate failure.

### G2 — Verification Quality (VQ) review lens
A mandatory reviewer lens `verification-quality` must run before final GO.
It must assess:
1. gate relevance to diff scope
2. gate robustness (non-trivial assertions)
3. requirement-level coverage quality
4. anti-gaming compliance

If lens finds blocking weaknesses, verdict must be `NO_GO` or `CONDITIONAL_GO` with explicit remediations.

### G3 — Requirement-level verification mapping
Every active requirement (R*) touched by the wave must map to at least one concrete verification check.
Mappings must be recorded in traceability artifacts.
Unmapped touched requirement => fail.

### G4 — Coverage policy (supporting signal, not sole gate)
Coverage is required and evaluated as follows:
1. Global line coverage floor: >= 70% (ramp target >= 80%)
2. Changed-lines coverage: >= 90%
3. Critical-path branch coverage (hooks/tools/config/security-sensitive modules): >= 90%

Coverage thresholds alone cannot convert weak tests into pass.

### G5 — Gate strength heuristics
For each touched critical module, verification must include:
1. at least one happy-path test
2. at least one negative-path test
3. at least one edge-case assertion tied to an acceptance criterion

If assertions are absent/trivial, gate fails regardless of coverage percentage.

### G6 — Mutation-lite verification for critical paths
For critical modules, run a mutation-lite probe or equivalent fault-injection check proving tests fail under intentional breakage.
If tests still pass under obvious breakage, gate fails.

### G7 — Diff-aware gate escalation
When diff touches security-sensitive or lifecycle-critical files, gate strictness increases automatically:
1. require Tier 3 + Tier 4 even if normally optional
2. require critical-path branch threshold
3. require VQ lens explicit rationale

### G8 — Reviewer proof requirements
Review artifacts must include:
1. commands executed
2. artifacts inspected
3. rationale for gate relevance to this diff
4. identified gaps and disposition

Missing proof metadata invalidates the review artifact.

### G9 — Anti-gaming rules
1. Coverage exclusions require explicit justification.
2. No blanket excludes for new production files.
3. High coverage cannot compensate for missing requirement mapping or weak assertions.
4. Spec-only lint/test passes are insufficient for GO when runtime behavior changed.

## Required artifacts
1. `.ai/log/plan/verification-gates-report-<wave>.json`
2. `.ai/log/review/review-verification-quality-<wave>.md`
3. Updated traceability map for touched requirements

## Enforcement clarifications (normative)
1. `gate:all` MUST execute and enforce all required tiers in one orchestration pass:
   - Tier 1 static hygiene
   - Tier 2 behavioral correctness
   - Tier 3 adversarial/negative-path checks
   - Tier 4 traceability integrity
2. Diff-aware escalation (G7) MUST be automated:
   - if security-sensitive or lifecycle-critical files are touched, Tier 3 + Tier 4 are mandatory,
   - critical-path branch coverage threshold is mandatory,
   - VQ review artifact must include explicit escalation rationale.
3. Anti-gaming (G9) MUST be machine-checked where possible:
   - coverage exclusions require justification metadata,
   - blanket excludes for new production files fail,
   - high coverage cannot override missing requirement mapping or weak assertions.
4. Artifact naming is strict and deterministic; implementations must use the exact required artifact paths above.

## Failure semantics
Any failure of G1–G9 is a hard gate failure for merge readiness.
Fail precedence is strict: mapping/quality failures cannot be overridden by coverage-only passes.

## Initial thresholds and ramp
- Start with thresholds above for next wave.
- Re-evaluate after two waves; increase global floor if stable.
