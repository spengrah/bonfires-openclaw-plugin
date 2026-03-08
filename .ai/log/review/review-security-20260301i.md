I've now read the complete patch (1594 lines), all 9 spec files, all 5 guidance files, and all 7 source files plus the test file. Let me compile the security review.

---

# Security Review — bonfires-plugin Wave 1

**Lens:** Security/Attacker
**Reviewer scope:** `wave-1-delta.patch` (full greenfield, 38 files)

---

## 1) Verdict

**CONDITIONAL_GO**

Both prior blockers are resolved. No new blocking findings. Several non-blocking findings require tracking for Wave 2 when mocks are replaced with real HTTP.

---

## 2) Blocking Findings

**None.**

### Prior Blocker Status

**Ledger path traversal — RESOLVED.**
`capture-ledger.ts:10-15` implements `isWithin()` using `resolve()` + `relative()` to validate the ledger file path against `baseDir`. Verified behavior:
- `resolve()` normalizes `../` before `relative()` sees it
- `relative()` output starting with `..` is correctly rejected
- Windows backslash traversal (`..\\`) is also checked
- `assertSafePath()` is called both at construction (`line 21`) and on every write (`line 38`)
- `index.ts:11-12` always supplies both `ledgerPath` and `logDir` (baseDir), so the guard is never silently bypassed in production

One edge note: `assertSafePath` is a no-op when `baseDir` is `undefined`, but the only codepath that omits `baseDir` is test code where `path` is also `undefined` (no file I/O). Acceptable.

**Unbounded limit — RESOLVED.**
`tools/bonfires-search.ts:5-6` clamps to `[MIN_LIMIT=1, MAX_LIMIT=50]` at runtime. `index.ts:29` also declares `minimum: 1, maximum: 50` in the JSON Schema. Double defense. Test at `wave1.test.mjs:53-56` confirms clamping of `limit: 9999` to `50`.

---

## 3) Non-blocking Findings

### SEC-NB-01: Query length not capped in `bonfires_search` tool (Medium)
`hooks.ts:26` truncates to 500 chars for `before_agent_start`, but `tools/bonfires-search.ts:21` passes `params.query` to the client unbounded. In Wave 1 mocks this is inert. In Wave 2, an arbitrarily long query could cause large HTTP request bodies or abuse the search API.
**Track for Wave 2.**

### SEC-NB-02: Prototype-key lookup in agent resolution (Low)
`config.ts:19`: `cfg.agents[agentId] ?? null` — if `agentId` is `"__proto__"`, `"constructor"`, or `"toString"`, the lookup returns a truthy non-string value (e.g., `Object.prototype`), bypassing the `?? null` nullish check. This value would propagate as the `agentId` in API calls. Risk is low since `ctx.agentId` comes from the host framework, not external input.
**Recommend:** Add `Object.hasOwn(cfg.agents, agentId)` guard or use `Object.create(null)` for the agents map.

### SEC-NB-03: Unsanitized Bonfires response in `prependContext` (Medium, Wave 2)
`hooks.ts:12`: `summary` and `source` from search results are interpolated directly into `prependContext` which is injected into the user turn. A compromised or hostile Bonfires backend could inject crafted content (prompt injection) into LLM context.
**Track for Wave 2:** Consider output encoding or content-length limits per field.

### SEC-NB-04: `parseConfig` does not validate numeric bounds (Low)
`config.ts:8-9`: `maxResults` and `throttleMinutes` accept `NaN`, `Infinity`, negative, or zero without validation. `throttleMinutes: 0` would disable throttling entirely (every turn pushes). `maxResults: Infinity` is mitigated by the 2000-char cap in `formatPrepend` but could still cause unexpected behavior.
**Recommend:** Add `if (!Number.isFinite(out.search.maxResults) || out.search.maxResults < 1) throw ...` at config parse time.

### SEC-NB-05: `baseUrl` not validated (Low, Wave 2)
`config.ts:6`: `baseUrl` is cast with `String()` only. In Wave 2, an SSRF vector exists if config sets `baseUrl` to `http://169.254.169.254/...` or `file://` schemes. Inert in Wave 1 mocks.
**Track for Wave 2:** Validate URL scheme is `https://` (or `http://` for local dev).

### SEC-NB-06: Ledger map grows unboundedly (Low)
`capture-ledger.ts:18`: `Map<sessionKey, Watermark>` has no eviction. Over many sessions, both the in-memory map and the persisted JSON grow without limit. Slow resource leak.
**Track for Wave 3** (recovery/catch-up is the natural place to add TTL eviction).

### SEC-NB-07: Non-atomic ledger write (Low)
`capture-ledger.ts:40`: `writeFileSync` can produce a truncated file on process crash mid-write. On restart, `JSON.parse` fails silently (`catch {}` at line 25), resetting the ledger to empty, which causes duplicate pushes. Bonfires deduplicates at the episode level per spec, so impact is limited.
**Recommend:** Write to temp file + rename (atomic replace) when wiring real persistence.

---

## 4) Required Remediation

No remediations are required to unblock Wave 1. The following are **recommended** before Wave 2:

| ID | Action | Priority |
|---|---|---|
| SEC-NB-01 | Add `query.slice(0, 500)` in `bonfiresSearchTool` | Before Wave 2 |
| SEC-NB-02 | Guard agent lookup with `Object.hasOwn()` | Before Wave 2 |
| SEC-NB-04 | Validate numeric config bounds in `parseConfig` | Before Wave 2 |

---

## 5) delta.git_diff Acknowledgement

**Yes.** The complete `wave-1-delta.patch` (1594 diff lines, 38 files) was read and cross-referenced against the live source files on disk. The patch content matches the current working tree. All `.ts` source, `.js` mirrors, specs, guidance, scripts, and test files were reviewed.


## Proof of review
- Artifacts inspected: src/hooks.ts, src/bonfires-client.ts, tests/wave1.test.ts, .ai/spec/spec/requirements-index.md
- Commands run: npm run -s test, npm run -s gate:traceability

- Confidence: high

