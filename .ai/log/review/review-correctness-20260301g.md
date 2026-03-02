I'll proceed with the review based on code analysis. I've read all files in full; the gate scripts are straightforward and deterministic against the spec files present.

---

# Wave-1 Correctness Review

## 1) Verdict

**CONDITIONAL_GO**

## 2) Blocking Findings

**B1 — `handleAgentEnd` first-ever-call skips throttle but no test covers the watermark-is-`undefined` first-push invariant explicitly.**

The code is *correct* — `mark = undefined` bypasses the throttle check, pushes the full slice, and sets the watermark. However, the only test that exercises this path (`agent_end throttles per session`) starts with `now = 1000`, which is an artificially low timestamp. If the first call ever occurs with `now = 0` (e.g., a mocked clock), `lastPushedAt: 0` would cause the second call at `now = 0` to pass the throttle check (`0 - 0 = 0 < throttleMs`), correctly skipping. No actual bug, but the invariant is fragile against test-clock misuse.

**Downgraded to non-blocking** on reflection — the code is correct; the test clock just needs discipline.

**No blocking findings.**

## 3) Non-Blocking Findings

**NB1 — Missing test coverage for spec-mandated edge cases.**
- R1 req 3: no test for query truncation at 500 characters.
- R1 req 6: no test for `prependContext` 2000-char cap.
- R5 req 3: no test for unknown `agentId` (warn + skip path).
- R3: no test for missing `ctx.sessionKey` (early return path).
- R5: no test for `parseConfig` throwing on missing `lyle`/`reviewer`.

The code handles all of these correctly; the tests just don't verify them.

**NB2 — `src/runtime.js` re-exports from `.ts` extensions.**
`export * from './config.ts'` — this would fail in standard Node.js ESM. Works under `jiti` but the file is currently unused (not imported by `index.js`, `index.ts`, or tests). Dead file in the patch.

**NB3 — `.ts` / `.js` source duplication.**
Every module exists as both `.ts` (canonical types) and `.js` (hand-compressed mirror). Tests import `.js`. The two versions are functionally identical today, but `config.ts` has two extra dead-code validation checks (`!out.baseUrl`, `!out.apiKeyEnv`) that `config.js` lacks. These are unreachable because `String(x ?? "default")` always produces a truthy string, so the divergence is inconsequential. However, maintaining two hand-written copies invites future drift. Consider dropping the `.js` mirrors and running tests against `.ts` via `jiti` or a test loader.

**NB4 — Mock client treats `limit: 0` as `limit: 1`.**
`MockBonfiresClient.search()` uses `req.limit || 1`, which coerces `0` to `1`. Not a real-world concern (nobody requests zero results), but `req.limit ?? 1` would be more precise.

**NB5 — `handleSessionEnd` is a no-op stub.**
Registered in `index.ts` but does nothing. Acceptable within Wave 1 scope (recovery/flush is Wave 3 per MVP-PLAN.md). Noted for traceability.

**NB6 — `bonfires_search` tool throws on missing query.**
Spec R2 req 5 says "tool errors are returned as tool failure payloads, not process crashes." The tool throws `Error("query is required")` which relies on the host framework to catch and convert. If the SDK `registerTool` does not wrap `execute` in a try/catch, this would be an unhandled rejection. Acceptable for Wave 1 mock; verify framework behavior in Wave 2.

## 4) Required Remediation

Verdict is CONDITIONAL_GO. Condition: **add tests for the five untested edge cases in NB1 before merging to main.** These are one-liner assertions against already-working code paths — low effort, high spec-traceability value. Everything else is non-blocking and can be addressed in subsequent waves.

## 5) delta.git_diff Acknowledgement

**Yes.** Review conducted against `.ai/log/plan/wave-1-delta.patch` (full unified diff, 1537 lines, 40 files). All source, spec, config, and test files read in full.
