# Security Review — PM18/PM19

- verdict: GO
- confidence: high

## Summary
PM18/PM19 are security-acceptable as implemented for this wave. The diff keeps retrieved Bonfires snippets in `prependContext` while moving only configured stable guidance into `prependSystemContext`, which does not expand attacker-controlled influence relative to prior behavior. The new fail-open path for policy/runtime constraints returns a clean no-op instead of emitting partial/malformed prompt state or aborting the turn. Config/schema changes are narrow, optional, and bounded to a single `retrieval.systemGuidance` string with `additionalProperties: false`.

From an attacker lens, the most important observation is that externally derived retrieval data still flows through the existing `prependContext` path (`src/hooks.ts:71-75`), while the new `prependSystemContext` path is fed only by operator-configured stable guidance and the already-existing approval-gated link-ingestion safety guidance (`src/hooks.ts:65,72,75`). That separation avoids a new prompt-injection escalation channel for Bonfires search results.

## Blocking findings
- None.

## Non-blocking findings
1. Coverage gap only: there is no PM18/PM19-specific test for the combined case where configured `retrieval.systemGuidance` and URL-triggered `LINK_INGESTION_GUIDANCE` are both present in `prependSystemContext` via `mergeSystemGuidance()` (`src/hooks.ts:36-38,65,72`). I do not see a security flaw in the current implementation, but an explicit test would better lock in ordering/boundary behavior.

## Evidence
1. **Stable guidance is isolated from retrieved snippets**
   - `src/config.ts:80-97` parses only optional local config `retrieval.systemGuidance`; empty/non-string values collapse to `undefined`.
   - `src/hooks.ts:71-75` emits retrieved Bonfires search output to `prependContext`, and emits system guidance separately to `prependSystemContext`.
   - This means attacker-influenced search results are not promoted into the higher-priority system-context channel by this wave.

2. **Fail-open path avoids malformed/partial prompt state**
   - `src/hooks.ts:43-45` exits early when `allowPromptInjection === false`, logging and returning `undefined` before any mutation result is constructed.
   - `src/hooks.ts:77-79` catches runtime/search failures and returns `undefined` rather than a partially-populated object.
   - Tests confirm no-throw/no-search/no-context behavior under policy constraint and no-throw fallback on search/runtime errors: `tests/wave13-pm18-pm19.test.ts:123-185`.

3. **Config/schema expansion is tightly bounded**
   - `openclaw.plugin.json:72-80` adds only `retrieval.systemGuidance` as an optional string and sets `additionalProperties: false`.
   - `tests/wave7-packaging.test.ts:27-46` verifies the new field is declared and that nested config objects, including `retrieval`, remain closed to extra keys.
   - This is a minimal surface-area increase and does not create a new user-controlled input channel.

4. **No security-relevant collision with dynamic retrieval path in this wave**
   - The active dynamic retrieval content remains formatted by `formatPrepend()` into `prependContext` (`src/hooks.ts:16-20,71,74`).
   - The only system-context additions are configured stable guidance and URL-ingestion safety instructions (`src/hooks.ts:8-14,65,72,75`).
   - Existing PM16 tests still confirm URL-related safety guidance lands in `prependSystemContext` while Bonfires retrieval remains in `prependContext`: `tests/wave14-pm16-pm17.test.ts:81-89`.

## Required remediation
- None required for PM18/PM19 security acceptance.

## Commit/closure statement
PM18/PM19 are acceptable for commit and closure from the Security/Attacker lens.
