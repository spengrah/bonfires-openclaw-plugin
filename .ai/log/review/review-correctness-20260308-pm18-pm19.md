verdict: GO
confidence: high

summary:
- PM18 is implemented correctly for the scoped wave: stable Bonfires guidance is configurable via `retrieval.systemGuidance`, parsed in config, and emitted through `prependSystemContext` rather than `prependContext`.
- PM19 is implemented correctly for the scoped wave: policy-constrained prompt-injection and retrieval-failure paths both fail open, log diagnostics, and return `undefined` instead of aborting turn handling.
- Config/schema/test coverage is semantically aligned to PM18/PM19 scope.

blocking findings:
- None for PM18/PM19 correctness scope.

non-blocking findings:
- The PM18 tests prove field separation and output shape, but they do not explicitly assert that the stable guidance string itself is absent from `prependContext` when retrieval results are present; current implementation evidence still indicates correctness because `prependContext` is built solely from search results.
- A broader `npm test` run in the repo is currently red due to unrelated Wave14 failures outside PM18/PM19 scope, so this review does not certify whole-repo green status.

evidence:
- `openclaw.plugin.json:72-80` adds optional `retrieval.systemGuidance` with description explicitly stating injection into `prependSystemContext`, and `additionalProperties: false` is retained for the new nested object.
- `src/config.ts:80-97` parses `cfg.retrieval.systemGuidance`, trims it, normalizes empty/non-string inputs to `undefined`, and exposes it as `out.retrieval.systemGuidance`.
- `src/hooks.ts:71-76` constructs `prependContext` exclusively from `formatPrepend(res.results ?? [])`, constructs system guidance separately via `mergeSystemGuidance(deps.cfg.retrieval?.systemGuidance, injectedLinkGuidance)`, and emits that only as `prependSystemContext`. This is the key correctness evidence that stable guidance is no longer emitted through `prependContext` on the PM18-enabled path.
- `src/hooks.ts:43-45` handles `ctx.policy.allowPromptInjection === false` by warning and returning early, which satisfies PM19 fail-open/no-abort behavior for policy-constrained injection.
- `src/hooks.ts:77-79` catches retrieval/injection errors, logs `before_agent_start error: ...`, and returns without throwing, preserving turn continuity.
- `tests/wave13-pm18-pm19.test.ts:44-58` verifies `prependSystemContext` emission when configured.
- `tests/wave13-pm18-pm19.test.ts:73-88` verifies system-context-only output when search results are empty.
- `tests/wave13-pm18-pm19.test.ts:103-118` verifies deterministic separation between `prependSystemContext` and `prependContext`.
- `tests/wave13-pm18-pm19.test.ts:123-210` verifies fail-open behavior for search errors, policy-constrained injection, non-Error throws, missing logger, and outage handling.
- `tests/wave7-packaging.test.ts:27-50` verifies manifest/schema exposure for `retrieval` and `retrieval.systemGuidance`.
- Targeted execution evidence: `node --import tsx --test tests/wave13-pm18-pm19.test.ts tests/wave7-packaging.test.ts` passed with `37/37` tests green.
- Broader regression note: `npm test -- --test-reporter=spec tests/wave13-pm18-pm19.test.ts tests/wave7-packaging.test.ts` still ran the full suite and reported unrelated failures in `tests/wave14-pm16-pm17.test.ts`; those failures do not appear attributable to the PM18/PM19 delta.

required remediation:
- None required for PM18/PM19 correctness sign-off.

explicit statement whether review should proceed to Security/Attacker:
- Yes. Correctness review for PM18/PM19 is GO and should proceed to Security/Attacker. Note separately that unrelated repo-wide test failures remain outside this wave's scoped review.
