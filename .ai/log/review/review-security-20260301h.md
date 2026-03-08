# Security Review — bonfires-plugin wave-1 (re-assessment)

**Lens:** Security/Attacker
**Scope:** `.ai/log/plan/wave-1-delta.patch` (all 37 new files)
**Prior review:** `review-security-20260301g.md` (CONDITIONAL_GO, 2 blockers)

---

## 1) Verdict: **GO**

Both prior blockers (B1, B2) have been remediated in this patch revision. No new blocking findings. Wave-1 remains a mocked-client skeleton with no live network calls — the attack surface is narrow and appropriately defended.

---

## 2) Blocking findings

**None.** Prior blockers resolved:

| Prior ID | Issue | Status |
|----------|-------|--------|
| B1 | Path traversal in ledger write | **Fixed** — `isWithin()` + `assertSafePath()` in `capture-ledger.ts:10-14,27-29` validates the resolved path stays under `baseDir` before `mkdirSync`/`writeFileSync`. `index.ts:11-12` passes `.ai/log` as the base dir. |
| B2 | Unbounded `limit` in search tool | **Fixed** — `bonfires-search.ts:10` clamps to `[1, 50]` via `Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, ...))`. Tool schema in `index.ts:17` now declares `minimum: 1, maximum: 50`. Test in `wave1.test.mjs:52` validates the clamp. |

---

## 3) Non-blocking findings

Carried from prior review (all remain valid, all acceptable for Wave-1 mocks):

- **N1** — Mock `summary` reflects user query unsanitized (`bonfires-client.ts:13`). Wave-2 must sanitize real API results before `prependContext` embedding.
- **N2** — `sessionKey` used as Map key without format validation (`hooks.ts:38`).
- **N3** — `agentId` logged unsanitized in warn messages (`hooks.ts:28,44`).
- **N4** — Sync `writeFileSync`/`readFileSync` in capture ledger hot path.
- **N5** — `apiKeyEnv` name stored but env value not checked at parse time (`config.ts:5`). Wave-2 must fail-fast on missing key.
- **N6** — Duplicate `.ts`/`.js` source files risk behavioral drift.

**New observations (non-blocking):**

- **N7** — `isWithin()` guard is bypassed when `baseDir` is falsy (`assertSafePath` returns early at `capture-ledger.ts:27`). Current usage always supplies `baseDir`, but the interface allows constructing an unguarded ledger. Consider making `baseDir` required if `path` is provided.
- **N8** — No content filtering on `event.messages` before capture push (`hooks.ts:50-51`). Conversation messages may contain system prompts, tool results with transient secrets, or PII. Acceptable with mocks; evaluate before Wave-2 real API wiring.

---

## 4) Required remediation

None for Wave-1 GO. Deferred items for Wave-2 tracked above (N1, N5, N7, N8).

---

## 5) delta.git_diff acknowledgement: **yes**

Reviewed full `wave-1-delta.patch` — all 37 new files across specs, guidance, rules, config, source (TS + JS), tests, and scripts. All hunks examined. B1/B2 remediation verified in source and test coverage.


## Proof of review
- Artifacts inspected: src/hooks.ts, src/bonfires-client.ts, tests/wave1.test.ts, .ai/spec/spec/requirements-index.md
- Commands run: npm run -s test, npm run -s gate:traceability

- Confidence: high

