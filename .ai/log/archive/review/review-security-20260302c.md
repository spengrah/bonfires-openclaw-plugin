---

# Security Review — delta-20260302c.patch

**Review lens:** Security / Attacker
**Input:** `.ai/log/plan/delta-20260302c.patch`
**Scope:** Wave 2 hosted API wiring — `HostedBonfiresClient`, `createBonfiresClient` factory, config changes, spec/guidance updates, pre-push gate, new test suite.

---

## 1) Verdict

**CONDITIONAL_GO**

---

## 2) Blocking Findings

None.

---

## 3) Non-blocking Findings

**S1 — No fetch timeout (DoS via slow upstream)**
`HostedBonfiresClient.fetchJson` (`src/bonfires-client.ts:53-59`) issues `fetch()` with no `AbortController`/timeout. A hanging or malicious upstream (or DNS delay) blocks the plugin's hook indefinitely, stalling the host agent turn. Attacker model: compromised/degraded Bonfires API endpoint. Risk: medium — fail-open semantics don't help if the promise never settles.

**S2 — `cfg: any` erases type-safety boundary on `HostedBonfiresClient`**
Constructor at `src/bonfires-client.ts:42` accepts `private cfg: any`. If any callsite passes a malformed config object (missing `baseUrl`, numeric `apiKeyEnv`, etc.), there is no runtime guard inside the class itself. Currently `parseConfig` validates upstream, but nothing prevents direct instantiation with bad data. Defense-in-depth concern.

**S3 — `apiKeyEnv` indirection reads arbitrary env vars**
`headers()` at `src/bonfires-client.ts:45` reads `process.env[this.cfg.apiKeyEnv]`. Combined with `baseUrl` control via config, an attacker who compromises plugin config could point `apiKeyEnv` to an arbitrary env var (e.g., `HOME`, `PATH`, `AWS_SECRET_ACCESS_KEY`) and `baseUrl` to an attacker server, exfiltrating the value via the `Authorization: Bearer` header. Mitigant: plugin config is a trusted host-provided input and `parseConfig` coerces to string. Risk: low (requires host-level config injection).

**S4 — No `baseUrl` scheme/domain validation**
`parseConfig` (`src/config.ts:8`) performs `String(cfg.baseUrl ?? ...)` with no validation that the URL uses HTTPS or points to a Bonfires domain. Same trust boundary caveat as S3, but worth a schema-level allowlist or at minimum an `https://` assertion for defense-in-depth.

**S5 — Error message includes API path**
`fetchJson` throws `Bonfires ${path} failed: HTTP ${res.status}` (`src/bonfires-client.ts:58`). The error propagates to the logger. It does **not** include the response body or auth header — acceptable, but verify that `path` can't contain user-supplied PII that would be logged.

**S6 — Coverage dip on new code**
Changed-lines coverage dropped to 98.3% (from 100%). Two uncovered lines in the new hosted client code. Not a security finding per se but reduces assurance on error-path behavior in production.

---

## 4) Required Remediation

No blocking remediation is required. Recommended before production deploy (non-blocking):

| ID | Recommendation | Priority |
|----|---------------|----------|
| S1 | Add `AbortSignal.timeout(ms)` (or `AbortController`) to `fetchJson` with a configurable timeout (e.g., 10s default). | High |
| S2 | Replace `cfg: any` with a narrow interface type matching `parseConfig` output. | Medium |
| S3/S4 | Add an `assert(baseUrl.startsWith('https://'))` guard in `parseConfig` and optionally validate `apiKeyEnv` against an allowlist (`DELVE_API_KEY`, `BONFIRES_API_KEY`). | Medium |
| S6 | Cover the remaining ~2 uncovered lines in `HostedBonfiresClient`. | Low |

---

## 5) delta.git_diff acknowledgement

**Yes** — reviewed `delta-20260302c.patch` in full. Files covered: `src/bonfires-client.ts`, `src/config.ts`, `src/index.ts`, `src/hooks.ts`, `src/capture-ledger.ts`, `tests/wave2-hosted.test.ts`, `scripts/gates/pre-push-state-check.mjs`, `scripts/spec-test.ts`, all `.ai/spec/**` and `.ai/log/**` metadata changes.
