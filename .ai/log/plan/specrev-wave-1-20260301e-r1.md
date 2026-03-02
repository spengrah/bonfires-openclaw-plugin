I have all the material I need. Here is the full spec review.

---

# Wave 1 Pre-Implementation Spec Review

## 1) Verdict: CONDITIONAL_GO

The specs are well-structured, traceable, and internally consistent. Wave 1 scope (skeleton + mocked client) is clear and achievable. The conditions below must be resolved before or during early implementation.

---

## 2) Ambiguities

| # | Location | Issue |
|---|----------|-------|
| A1 | `spec-for-before-agent-start.md` R1.1 | Hook uses `event.prompt` — but the OpenClaw SDK hook payload shape is not pinned anywhere. No TypeScript type import path or SDK version is specified. If the real field is `event.message`, `event.input`, or nested differently, the entire retrieval path breaks. |
| A2 | `spec-for-agent-end-capture.md` R3.2 | Spec says watermark tracked per `ctx.sessionKey` but never defines where `ctx.sessionKey` comes from. Is it on the hook event? A global context object? The SDK's session ID? This drives the ledger key. |
| A3 | `spec-for-agent-end-capture.md` R3.4 | "push only new message slice since `lastPushedIndex`" — but no spec says where the full message array lives. Does `agent_end` receive the messages in `event.messages`? Or must the plugin read the JSONL transcript from disk? Wave 1 mocks need to know the shape. |
| A4 | `spec-for-before-agent-start.md` R1.5 | "return `prependContext` with stable heading and separators" — the exact format (markdown heading level, separator string, per-result template) is unspecified. This matters for the 2000-char cap and test assertions. |
| A5 | `spec-for-plugin-config-and-agent-mapping.md` R5.1 | Config schema is described narratively but not as a TypeScript interface or JSON Schema. `baseUrl`, `search`, `capture`, `agents` shapes are implied but not pinned. |
| A6 | `coupling-map.md` line 16 | Recovery reads transcripts from `~/.openclaw/agents/.../sessions/*.jsonl` — the exact glob is not pinned. This is Wave 3, but the coupling map references it now; if Wave 1 capture-ledger needs to anticipate that path, it should be noted. |
| A7 | MVP-PLAN line 40 | Wave 1 says "Implement in-memory per-session capture watermark map" but the agent_end spec (R3) says the ledger must be shared with recovery (R4.2). Wave 1 in-memory vs. Wave 3 persisted — is the Wave 1 ledger interface designed to be swappable, or will it be rewritten? |

---

## 3) Missing Checks / Artifacts

| # | What's Missing | Impact |
|---|---------------|--------|
| M1 | **No OpenClaw SDK type verification.** Verification-checklist line 6 says "OpenClaw SDK types verified for `before_agent_start` payload fields" — but there is no SDK package in `package.json`, no type import, and no reference to a specific SDK version. This gate cannot currently pass. |
| M2 | **No `tsconfig.json`.** Wave 1 adds `index.ts`, `bonfires-client.ts`, etc., and gate is "Type/lint passes." There is no TypeScript config in the repo. |
| M3 | **No TypeScript compiler or test runner in dependencies.** `package.json` has zero dependencies. Wave 1 needs at minimum: `typescript`, a test runner (vitest/jest), and presumably the OpenClaw plugin SDK. |
| M4 | **R6 missing from traceability map.** The requirements-index defines R6 (Bonfires client interface), but `traceability-map.json` only has R1–R5. The spec-test script only checks R1–R5. R6 is untraced. |
| M5 | **No `prependContext` format contract.** The spec says "stable heading and separators" but never defines them. There is no test fixture or format template. |
| M6 | **No `.ai/log/` evidence artifact for this review.** Core rules require evidence in `.ai/log/`. A previous review file exists at `.ai/log/plan/specrev-wave-1-20260301e-r1.md` but the current review is not yet logged. |
| M7 | **Wave 0 gate status unclear.** MVP-PLAN defines Wave 0 as "replace placeholder commands with real lint/test." The current `npm run lint` and `npm run test` run spec-lint/spec-test (spec-file checks), but Wave 1 gate says "Type/lint passes" which implies TypeScript compilation. Wave 0 completion is ambiguous. |

---

## 4) Likely Failure Modes

| # | Failure Mode | Likelihood | Consequence |
|---|-------------|------------|-------------|
| F1 | **SDK payload mismatch.** Implementing against assumed `event.prompt` / `ctx.agentId` / `ctx.sessionKey` fields that don't match the real SDK will require a rewrite of every hook handler. | High | All hook logic invalidated. |
| F2 | **prependContext format drift.** Without a pinned format, the 2000-char cap test and any downstream consumer will be fragile. Different implementations will produce different output and tests will break on trivial formatting changes. | Medium | Flaky tests, unstable contract. |
| F3 | **Watermark ledger interface mismatch between Wave 1 and Wave 3.** If Wave 1 builds a pure in-memory `Map<string, Watermark>` without an interface that Wave 3 can swap for a persisted implementation, the refactor cost is non-trivial. | Medium | Wave 3 rework. |
| F4 | **Config parse errors silently swallowed.** Guidance says "fail fast on missing required config at startup" but spec R5.3 says unknown agentId is non-fatal. If the boundary between startup-fatal and runtime-non-fatal isn't crisp, the plugin either crashes unexpectedly or silently does nothing. | Medium | Silent malfunction or crash. |
| F5 | **`bonfires_search` limit default.** Spec says `limit` defaults to `config.search.maxResults` but no default numeric value is pinned. Mock tests need a concrete number. | Low | Test ambiguity. |

---

## 5) Patch-Ready Edits (Top 5)

These are the highest-value spec clarifications. No files modified; diffs are presented for review.

### P1. Pin SDK payload shape in `spec-for-before-agent-start.md`

```markdown
// After line 3, add:

## SDK contract (provisional)
Hook receives:
- `event.prompt: string` — the user's current-turn input.
- `ctx.agentId: string` — the mapped agent identifier.
- `ctx.sessionKey: string` — unique session identifier.
- Return type: `{ prependContext?: string }` or `void`.

Source: [pin OpenClaw SDK version or link here once confirmed].
```

### P2. Pin `prependContext` format in `spec-for-before-agent-start.md`

```markdown
// After requirement 5, add:

### prependContext format
```
--- Bonfires context ---
- {summary} (source: {source}, relevance: {score})
- {summary} (source: {source}, relevance: {score})
---
```
Each result is one `- ` line. Omit results that would push total past 2000 characters.
```

### P3. Add R6 to `traceability-map.json`

```json
// Append to "requirements" array:
{"id":"R6","spec":".ai/spec/spec/plugin/spec-for-bonfires-client-interface.md","guidance":".ai/spec/guidance/plugin/guidance-for-bonfires-search-tool.md","verification":[".ai/spec/spec/plugin/verification-checklist.md"]}
```

### P4. Pin config schema in `spec-for-plugin-config-and-agent-mapping.md`

```markdown
// After requirement 1, add:

### Config shape (provisional)
```ts
interface BonfiresPluginConfig {
  baseUrl: string;
  apiKeyEnv: string;           // env var name, e.g. "BONFIRES_API_KEY"
  search: { maxResults: number };        // default: 5
  capture: { throttleMinutes: number };  // default: 15
  agents: Record<string, string>;        // e.g. { lyle: "bf-agent-lyle", reviewer: "bf-agent-reviewer" }
}
```
```

### P5. Add ledger interface note to `spec-for-agent-end-capture.md` for Wave 1/3 compatibility

```markdown
// After requirement 5, add:

6. Wave 1 ledger must implement an interface (`CaptureLedger`) that Wave 3
   can replace with a persisted implementation without changing hook code.
   Minimum interface:
   - `get(sessionKey: string): Watermark | undefined`
   - `set(sessionKey: string, watermark: Watermark): void`
   Where `Watermark = { lastPushedAt: number; lastPushedIndex: number }`.
```

---

## 6) Explicit DO and EXPECT for Wave 1

### DO (Wave 1 scope)

1. **DO** create `package.json` with `typescript`, a test runner, and the OpenClaw plugin SDK as dependencies. Add `tsconfig.json`.
2. **DO** create `src/index.ts` registering `before_agent_start`, `agent_end` hooks, and `bonfires_search` tool.
3. **DO** create `src/bonfires-client.ts` as a mock implementing `SearchRequest → SearchResponse` and `CaptureRequest → CaptureResponse` per the provisional interface spec.
4. **DO** create `src/config.ts` with typed config parse, fail-fast on missing required fields at startup, and `lyle`/`reviewer` agent mapping.
5. **DO** create `src/capture-ledger.ts` with an in-memory `CaptureLedger` behind an interface so Wave 3 can swap in a persisted implementation.
6. **DO** implement the 500-char truncation, 2000-char prependContext cap, and empty-prompt skip per spec R1.
7. **DO** implement per-session throttle in `agent_end` with default 15-minute window.
8. **DO** wrap all hook bodies in try/catch so errors are logged but never crash the plugin.
9. **DO** write unit tests covering: hook happy path, empty prompt, oversized prompt truncation, throttle window skip, unknown agentId skip, tool schema validation, and error swallowing.
10. **DO** update `npm run lint` and `npm run test` to include TypeScript type-checking and unit test execution (Wave 0 completion).

### EXPECT (Wave 1 exit criteria)

1. **EXPECT** `npm run lint` exits 0 (includes spec-lint AND tsc --noEmit).
2. **EXPECT** `npm run test` exits 0 (includes spec-test AND unit test suite).
3. **EXPECT** `before_agent_start` unit test: two turns → two distinct mock search calls with the respective prompts.
4. **EXPECT** `before_agent_start` unit test: empty prompt → zero mock search calls.
5. **EXPECT** `before_agent_start` unit test: mock Bonfires error → hook returns no context, no throw.
6. **EXPECT** `agent_end` unit test: two calls within 15m → one mock capture call.
7. **EXPECT** `bonfires_search` unit test: valid call → schema-compliant response; invalid input → tool error payload.
8. **EXPECT** Config test: missing required field → startup throws; unknown agentId → logged warning, no throw.
9. **EXPECT** No secrets in committed files. API key loaded from env var name in config.
10. **EXPECT** All files match the coupling map: `index.ts`, `bonfires-client.ts`, `capture-ledger.ts`, `config.ts`. `session-recovery.ts` is **not** created in Wave 1 (Wave 3 scope).

---

**Summary:** Specs are solid for the scope they cover. The primary risk is the unverified SDK contract (A1/M1/F1) — if the hook payload shape is wrong, everything downstream breaks. Resolve M1 (SDK types) and apply patches P1–P5 before starting implementation and this is a clean GO.
