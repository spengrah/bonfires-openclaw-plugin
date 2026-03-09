# Review Support — Wave 10 PM18/PM19 (Phase 1)

## Reviewer focus areas
1. **Scope discipline**
   - Confined to PM18/PM19 retrieval output shaping + policy fallback.
   - No ContextEngine/ingestion redesign mixed into this wave.
2. **Correctness**
   - Stable guidance placement to system context is deterministic.
   - Dynamic per-turn snippets preserve expected behavior.
3. **Safety + resilience**
   - Policy-constrained prompt-injection path is fail-open.
   - Retrieval failures never abort turn execution.
4. **Backward compatibility**
   - Defaults preserve prior behavior unless explicitly enabled/configured.

## Blocking findings (NO_GO)
1. Any path that can abort turn handling due to prompt-policy constraints.
2. Missing tests for system-context emission and policy-constrained fallback.
3. Scope creep into ContextEngine migration or ingestion architecture changes.
4. Regression in existing retrieval/capture behavior.

## Conditional findings (CONDITIONAL_GO)
1. Log/diagnostic shape needs minor normalization, but fail-open behavior is correct.
2. Config naming/defaults need tightening, but behavior is backward compatible.
3. Minor formatting drift in context text boundaries without safety impact.

## Robust PM18/PM19 test plan
1. **Field-emission tests**
   - assert stable Bonfires guidance is emitted in `prependSystemContext`
   - assert stable Bonfires guidance is not also emitted in `prependContext`
2. **Output-shape tests**
   - assert no malformed hybrid output when only system-context guidance is populated
   - assert PM18/PM19 does not accidentally redefine dynamic retrieval migration scope
3. **Policy-constrained fail-open tests**
   - simulate prompt-mutation-constrained runtime/policy path
   - assert no throw, no turn abort, and no malformed hook result
4. **Boundary/deduplication tests**
   - assert stable guidance and dynamic retrieval content do not duplicate each other
   - assert formatting boundaries remain deterministic and bounded
5. **Behavior-regression tests**
   - assert URL-detection guidance injection still works when applicable
   - assert empty Bonfires retrieval results still yield valid no-op/partial output
   - assert logger diagnostics stay structured and bounded on fallback paths

## Required artifacts before implementation kickoff
1. Accepted PM18/PM19 spec + guidance docs.
2. Accepted verification matrix for Wave 10.
3. Updated requirements index + traceability map entries.
4. Accepted robust PM18/PM19 test plan covering system-context emission, backward-compatible defaults, policy-constrained fail-open behavior, deterministic stable/dynamic boundaries, and behavior-regression checks.

## Required artifacts before merge
1. Lint/test gate pass evidence.
2. Test evidence for PM18/PM19 acceptance criteria.
3. Reviewer lens outputs (Verification Quality -> Correctness -> Security/Attacker).
