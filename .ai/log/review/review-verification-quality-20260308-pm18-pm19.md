verdict: NO_GO
confidence: high

summary:
- PM18 acceptance evidence is mostly present: stable Bonfires guidance is configurable via `retrieval.systemGuidance`, emitted through `prependSystemContext`, and remains separated from dynamic retrieval snippets in `prependContext`.
- PM19 acceptance evidence is also present: policy-constrained and retrieval-failure paths are fail-open, return no hook payload, and log diagnostics instead of aborting turn handling.
- However, the implementation/package/schema evidence is not fully coherent for reviewer-readiness in this delta. `src/config.ts` adds parsing/validation for `discovery.*` and `ingestion.approval.maxUrlsPerRun`, while `openclaw.plugin.json` only adds schema for `retrieval.systemGuidance` and does not declare `discovery` or `ingestion.approval`. That is an implementation↔schema mismatch inside the reviewed delta and is out of scope for a PM18/PM19-only wave.

blocking findings:
- Implementation/schema incoherence in reviewed delta.
  - `src/config.ts:86-95, 107-120` parses and validates `discovery.enabled`, `discovery.maxCandidates`, and `ingestion.approval.maxUrlsPerRun`.
  - `openclaw.plugin.json:72-80` only adds `retrieval.systemGuidance`; there is no top-level `discovery` schema and no `ingestion.approval` schema.
  - This breaks acceptance criterion 4 (“implementation/test/package/schema evidence is coherent enough for reviewer-readiness”) and introduces PM16/PM17-adjacent config concerns into a PM18/PM19 review wave.

non-blocking findings:
- Test evidence for PM18/PM19 itself is strong and appropriately targeted.
- The fail-open diagnostic shape is concise and bounded, though not strongly structured beyond message text.

evidence:
- Stable guidance config parsing:
  - `src/config.ts:80-84` trims and normalizes `retrieval.systemGuidance`.
  - `src/config.ts:107` returns `retrieval: { systemGuidance }`.
- Stable guidance emission + non-redundant placement:
  - `src/hooks.ts:71-75` builds `prependContext` from search results only and `prependSystemContext` from merged stable/link guidance.
  - There is no code path in the reviewed delta that copies `retrieval.systemGuidance` into `prependContext`.
- Fail-open handling:
  - `src/hooks.ts:43-45` no-ops when `allowPromptInjection === false`.
  - `src/hooks.ts:77-79` catches failures, logs, and returns without aborting.
- Package/schema evidence for PM18:
  - `openclaw.plugin.json:72-80` declares optional `retrieval.systemGuidance` with `additionalProperties: false`.
  - `tests/wave7-packaging.test.ts:27-42` verifies `retrieval` is exposed in manifest schema.
- PM18/PM19 test evidence:
  - `tests/wave13-pm18-pm19.test.ts:44-58` asserts `prependSystemContext` emission.
  - `tests/wave13-pm18-pm19.test.ts:73-87` asserts system-context-only output when search returns no results.
  - `tests/wave13-pm18-pm19.test.ts:103-118` asserts deterministic separation between `prependSystemContext` and `prependContext`.
  - `tests/wave13-pm18-pm19.test.ts:123-209` covers fail-open error/policy paths.
- Traceability/planning support is present:
  - `.ai/spec/spec/requirements-index.md` contains PM18/PM19 entries.
  - `.ai/spec/spec/quality/traceability-map.json` contains PM18/PM19 mappings.
  - `.ai/log/plan/verification-matrix-wave-10-phase1-system-context-20260308.md` and `.ai/log/plan/review-support-wave-10-phase1-system-context-20260308.md` align with the intended wave.
- Gate evidence executed during review:
  - `node --import tsx --test tests/wave13-pm18-pm19.test.ts tests/wave7-packaging.test.ts` passed (37/37).

required remediation:
- Make the reviewed delta internally coherent before Correctness review:
  1. Remove the unrelated `discovery.*` / `ingestion.approval.*` config parsing from this PM18/PM19 delta, or
  2. Add the corresponding manifest/schema coverage and explicit traceability if those config changes are intentionally part of this wave.
- Keep the PM18/PM19 reviewer packet scoped strictly to retrieval system-context placement and fail-open prompt-policy behavior.

should review proceed to Correctness:
- No. Verification Quality should not proceed to Correctness until the implementation/schema scope-coherence issue above is remediated.
