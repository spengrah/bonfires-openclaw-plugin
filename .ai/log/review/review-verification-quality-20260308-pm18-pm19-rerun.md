verdict: CONDITIONAL_GO
confidence: high

summary:
- PM18/PM19 rerun delta is narrowly scoped and materially aligns implementation, config schema, and focused tests with the phase intent.
- Stable configured Bonfires guidance now has a dedicated `retrieval.systemGuidance` config path and is emitted via `prependSystemContext`, while dynamic retrieval snippets remain separately formatted in `prependContext`.
- Policy-constrained and retrieval-error paths are fail-open in `handleBeforeAgentStart`; the hook logs and returns `undefined` instead of throwing, which preserves turn continuity.
- Reviewer-readiness is mostly coherent across implementation/spec/guidance/package/schema artifacts, but one acceptance point is only indirectly verified in tests rather than asserted directly.

blocking findings:
- None within PM18/PM19 verification scope.

non-blocking findings:
- Acceptance criterion 2 is supported by implementation shape but not asserted as directly as it could be. `tests/wave13-pm18-pm19.test.ts` verifies both fields are independent and that `prependSystemContext` carries the stable guidance, but it does not explicitly assert that the configured stable guidance string is absent from `prependContext` when both fields are present.
- Broader repo test execution (`npm test`) currently reports unrelated PM16/PM17 failures, so this rerun should not be interpreted as a whole-repo green signal. This is out of scope for the PM18/PM19 verification-lens verdict but worth keeping separate from merge-readiness claims.

evidence:
- Delta scope: `.ai/log/review/delta-pm18-pm19-implementation-rerun-20260308.patch` adds `retrieval.systemGuidance` schema/config support and PM18/PM19-focused tests only; no ContextEngine migration or ingestion redesign is mixed in.
- Config/schema coherence:
  - `openclaw.plugin.json:72-80` defines optional `retrieval.systemGuidance` with `additionalProperties: false`.
  - `src/config.ts:80-97` normalizes `cfg.retrieval.systemGuidance` to trimmed string-or-`undefined` and surfaces it under `out.retrieval.systemGuidance`.
  - `tests/wave7-packaging.test.ts:27-49` verifies `retrieval` is present in schema, exposes `systemGuidance`, and keeps nested `additionalProperties: false`.
- PM18 implementation evidence:
  - `src/hooks.ts:71-76` builds dynamic retrieval text into `prependContext` from `formatPrepend(res.results ?? [])`, while stable guidance is built separately as `systemGuidance` and emitted only to `prependSystemContext`.
  - `src/hooks.ts:36-39` and `65-75` preserve a deterministic boundary by merging configured stable guidance with link-ingestion guidance into the system-context field while keeping retrieved snippets separate.
  - `tests/wave13-pm18-pm19.test.ts:44-58` verifies configured stable guidance is emitted in `prependSystemContext`.
  - `tests/wave13-pm18-pm19.test.ts:73-88` verifies empty search results yield only `prependSystemContext` when stable guidance is configured.
  - `tests/wave13-pm18-pm19.test.ts:103-118` verifies `prependSystemContext` and `prependContext` are independent strings.
- PM19 fail-open evidence:
  - `src/hooks.ts:42-46` explicitly treats `allowPromptInjection === false` as a logged no-op path.
  - `src/hooks.ts:77-79` catches failures and returns without throwing.
  - `tests/wave13-pm18-pm19.test.ts:123-135` verifies search-error fail-open behavior.
  - `tests/wave13-pm18-pm19.test.ts:137-153` verifies fail-open still holds when system guidance is configured.
  - `tests/wave13-pm18-pm19.test.ts:155-171` verifies policy-constrained injection degrades to no-op, avoids search, and logs a diagnostic.
  - `tests/wave13-pm18-pm19.test.ts:173-198` verifies non-Error throws and logger-absent cases remain non-fatal.
  - `tests/wave13-pm18-pm19.test.ts:200-210` verifies existing outage handling remains intact.
- Focused execution evidence:
  - `node --import tsx --test tests/wave13-pm18-pm19.test.ts` => 15/15 passing.
  - `node --import tsx --test tests/wave7-packaging.test.ts` => 22/22 passing.
- Spec/guidance alignment:
  - `.ai/spec/spec/retrieval/system-context-injection-and-prompt-policy-fallback.md` defines PM18 migration to `prependSystemContext`, PM19 fail-open behavior, and conservative optional config.
  - `.ai/spec/guidance/retrieval/guidance-for-system-context-injection-and-prompt-policy-fallback.md` enforces narrow scope and reviewer expectations consistent with the rerun delta.
  - `.ai/log/plan/verification-matrix-wave-10-phase1-system-context-20260308.md` and `.ai/log/plan/review-support-wave-10-phase1-system-context-20260308.md` match the observed artifact/test structure.

required remediation (if any):
- Add one explicit PM18 assertion that, when `retrieval.systemGuidance` is configured and retrieval results are present, `prependContext` does not contain the configured stable guidance text. This would close the remaining traceability gap for acceptance criterion 2.

should review proceed to Correctness:
- Yes. Proceed to Correctness, with the note that the direct non-duplication assertion above should ideally be tightened soon for stronger verification traceability.
