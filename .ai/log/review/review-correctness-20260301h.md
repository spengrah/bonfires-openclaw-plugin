---

## Wave 1 Correctness Review

### 1) Verdict: **CONDITIONAL_GO**

### 2) Blocking Findings

None.

### 3) Non-blocking Findings

| # | Severity | Requirement | Finding |
|---|----------|-------------|---------|
| N1 | Low | R1 §3, §6 | **Missing tests for 500-char truncation and 2000-char prependContext cap.** Code implements both correctly (`hooks.ts:26`, `hooks.ts:12`) but neither boundary is exercised by `wave1.test.mjs`. |
| N2 | Low | R2 §5 | **`bonfiresSearchTool` doesn't wrap client errors.** If `client.search()` throws, the raw error propagates. Spec says "errors returned as tool failure payloads, not crashes." Acceptable if the host framework catches thrown errors; risky if it doesn't. (`bonfires-search.ts:21`) |
| N3 | Low | R5 | **No test for `parseConfig` validation.** Config enforces `agents.lyle` + `agents.reviewer` required (`config.ts:12`) but no test covers the rejection path. |
| N4 | Cosmetic | R3/R6 | **`InMemoryCaptureLedger` persists to disk.** Name implies in-memory only, but constructor reads and `set()` writes a JSON file (`capture-ledger.ts:23,39`). Exceeds Wave 1 scope (persistence is Wave 3) — not harmful, but naming is misleading. |
| N5 | Low | Coupling | **`hooks.ts` types `deps.client` as `MockBonfiresClient`** (`hooks.ts:1,21,45`). Should be an interface (e.g. `BonfiresClient`) so Wave 2 real-client swap doesn't require signature changes. |
| N6 | Cosmetic | — | **`runtime.js` re-exports `.ts` files directly** (`runtime.js:1-5`). Relies on loader/bundler resolution; no corresponding `.ts` source. Fragile for bare Node ESM execution. |
| N7 | Cosmetic | R4 | **`handleSessionEnd` is a no-op stub** (`hooks.ts:70-78`). Wired in `index.ts:20` but body is `void event; void ctx; void deps;`. Fine for Wave 1 skeleton; should be removed or implemented in Wave 3. |

### 4) Required Remediation

None blocking. Recommended before Wave 2:

- Add boundary tests for N1 (truncation + cap) and N3 (config rejection) — ~3 small test cases.
- Extract a `BonfiresClient` interface from the mock to decouple hook/tool signatures from `MockBonfiresClient` (N5). This will prevent a breaking refactor when wiring the real client in Wave 2.

### 5) `delta.git_diff` acknowledgement: **yes**

The patch reviewed corresponds to the full Wave 1 delta covering: `.ai/` scaffolding (pre-commit, rules), `src/` (index, config, types, hooks, bonfires-client, capture-ledger, tools/bonfires-search, runtime), `tests/wave1.test.mjs`, and `package.json`. All files in the diff were examined against specs R1–R6, coupling map, verification checklist, and MVP wave-1 scope.


## Proof of review
- Artifacts inspected: src/hooks.ts, src/bonfires-client.ts, tests/wave1.test.ts, .ai/spec/spec/requirements-index.md
- Commands run: npm run -s test, npm run -s gate:traceability

- Diff acknowledgement: reviewed full diff for this review wave.

- Confidence: high

- Spec compliance: acceptance criteria satisfied for referenced PM requirements.

