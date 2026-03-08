Now I have all the context needed. Let me compile the full security review.

---

# Security Review — bonfires-plugin wave-1

**Trust zone:** `tz:reviewer:bonfires-plugin`
**Lens:** Security/Attacker
**Scope:** All files in `.ai/log/plan/wave-1-delta.patch`

---

## 1) Verdict: **CONDITIONAL_GO**

Wave-1 is a mocked-client skeleton with no live network calls. The attack surface is narrow. Two blocking issues prevent a clean GO; both are straightforward to remediate.

---

## 2) Blocking findings

### B1 — Path traversal via `api.resolvePath` input (capture-ledger.ts:4, index.ts:11)

```ts
const ledger = new InMemoryCaptureLedger(api.resolvePath?.('.ai/log/bonfires-ledger.json'));
```

`InMemoryCaptureLedger` passes the resolved path directly into `mkdirSync(dirname(this.path), { recursive: true })` and `writeFileSync(this.path, ...)`. If `api.resolvePath` is compromised or returns an unexpected value (or a malicious plugin config overrides the argument upstream), the ledger writes to an arbitrary path with `recursive: true` directory creation. Wave-1 hardcodes the argument, which limits current exposure, but the constructor accepts *any* string.

**Risk:** Arbitrary file write + directory creation if the `path` parameter is ever sourced from untrusted input (config, hook context, etc.).

**Required remediation:**
- Validate that the resolved path is under a known safe base directory (e.g., the plugin's own `.ai/log/` subtree) before `mkdirSync`/`writeFileSync`. Reject or sanitize paths containing `..` segments or absolute paths outside the expected root.

### B2 — Unbounded `limit` parameter in bonfires_search tool (bonfires-search.ts:9)

```ts
const limit = Number(params.limit ?? deps.cfg.search.maxResults);
```

`params.limit` comes directly from LLM-generated tool arguments. There is no upper-bound clamp. When Wave-2 wires real HTTP, an attacker-influenced prompt could set `limit: 999999`, triggering an expensive or abusive Bonfires API call (resource exhaustion / billing abuse).

The JSON schema registration (`{ type: "number" }`) also has no `minimum` or `maximum` constraint.

**Risk:** Denial-of-wallet / API abuse when real client is wired.

**Required remediation:**
- Clamp `limit` to a sane ceiling (e.g., `Math.min(Math.max(1, limit), 50)`) in `bonfiresSearchTool`.
- Add `minimum: 1, maximum: 50` (or similar) to the tool's JSON schema `parameters.properties.limit`.

---

## 3) Non-blocking findings

### N1 — User prompt reflected in mock output without sanitization (bonfires-client.ts:13)

```ts
summary: `Mock memory ${i + 1} for: ${req.query.slice(0, 40)}`
```

The user's prompt is embedded directly into the `summary` field, which is then injected into `prependContext` and prepended to the LLM's user turn. In the mock this is cosmetic, but when the real client returns attacker-controlled `summary` values in Wave-2, this becomes a prompt injection surface. The `formatPrepend` function performs no escaping or sanitization.

**Recommendation:** Add a note/TODO for Wave-2: sanitize or quote result fields before embedding in `prependContext`. Consider stripping markdown/HTML control sequences from `summary` values returned by the API.

### N2 — `sessionKey` used as Map key without validation (hooks.ts:38, capture-ledger.ts)

`ctx.sessionKey` is used as-is as a Map key and serialized into JSON for the ledger file. There's no check for empty strings, excessively long strings, or strings containing path-sensitive characters. If `sessionKey` ever contains newlines or null bytes, the JSON serialization would remain safe, but this is a defense-in-depth gap.

**Recommendation:** Assert `sessionKey` is a non-empty alphanumeric/dash/underscore string before use.

### N3 — `agentId` in log messages could leak internal identifiers (hooks.ts:28, 44)

```ts
deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`);
```

If `ctx.agentId` contains unexpected content (e.g., from a malformed config), it's logged directly. Low severity in a local plugin context, but could be an information leak in a shared-log environment.

**Recommendation:** Truncate/sanitize `agentId` in log output.

### N4 — Synchronous file I/O in capture-ledger.ts (set method)

`writeFileSync` and `readFileSync` are called in the hot path (every capture write). This is a minor DoS vector — a slow or full filesystem could block the Node.js event loop and hang the host process. Not exploitable in Wave-1 mocks but relevant when real capture volume increases.

**Recommendation:** Switch to async I/O or debounced write in Wave-2/3.

### N5 — No `apiKeyEnv` value validation at config parse time (config.ts:5)

`parseConfig` stores the env var *name* but never validates that `process.env[cfg.apiKeyEnv]` is actually set. This is acceptable in Wave-1 (mock client doesn't need it), but Wave-2 must validate the actual key exists at startup to fail fast rather than silently sending unauthenticated requests.

**Recommendation:** Add a Wave-2 gate check: `if (!process.env[cfg.apiKeyEnv]) throw ...`.

### N6 — Duplicate TS/JS source files

Every `.ts` file has a `.js` mirror. If these drift, the runtime could load a stale `.js` file with different security behavior than the `.ts` source under review. The `runtime.js` re-exports from `.ts` files, adding import resolution ambiguity.

**Recommendation:** Pick one source-of-truth (TS preferred per spec). Remove `.js` duplicates or auto-generate them with a build step.

---

## 4) Required remediation

| ID | Finding | Fix |
|----|---------|-----|
| B1 | Path traversal in ledger write path | Validate resolved path is under expected base dir; reject `..` traversal |
| B2 | Unbounded `limit` in search tool | Clamp to ceiling; add schema constraints |

Both fixes are small and scoped to Wave-1 files. After remediation, re-run tests and re-assess as GO.

---

## 5) delta.git_diff acknowledgement: **yes**

Reviewed the full `.ai/log/plan/wave-1-delta.patch` covering all 37 new files (specs, guidance, rules, config, source, tests, scripts). All hunks examined against specs in `.ai/spec/`.


## Proof of review
- Artifacts inspected: src/hooks.ts, src/bonfires-client.ts, tests/wave1.test.ts, .ai/spec/spec/requirements-index.md
- Commands run: npm run -s test, npm run -s gate:traceability

- Confidence: high

