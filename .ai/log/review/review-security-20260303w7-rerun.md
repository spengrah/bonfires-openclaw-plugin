# Security Review — bonfires-plugin wave 7 (212d12f)

**Reviewer**: Security/Attacker lens
**Diff**: `diff-wave-7-212d12f.patch` (12 files, +621 / -35)
**Date**: 2026-03-03

---

## 1. Verdict

**CONDITIONAL_GO** — Confidence: 78

The diff introduces solid packaging, env-fallback secret ergonomics, lifecycle dispose, and strict manifest schema. Secret handling is well-designed (indirection via env-var name, redacted diagnostics, no credential serialization). Two findings at confidence 70+ require remediation before merge: missing path-traversal validation on user-supplied `stateDir` and `ingestion.rootDir`, and `agents` schema permitting unconstrained keys. Neither is immediately exploitable in a typical single-operator deployment, but both widen the attack surface for multi-user or adversarial-config scenarios that the spec explicitly targets ("safe for multi-user OpenClaw installs").

---

## 2. Blocking findings

### B1 — No path-traversal validation on `stateDir` (confidence: 82)

**Location**: `src/config.ts:16`, `src/index.ts:13-14`

**Evidence**:
```typescript
// config.ts:16
const stateDir = String(cfg.stateDir ?? '.bonfires-state');

// index.ts:13-14
const stateDir = resolvePath(cfg.stateDir);
const ledgerPath = resolvePath(`${cfg.stateDir}/capture-ledger.json`);
```

**Attack vector**: An operator (or compromised config file) sets `stateDir` to `../../etc` or an absolute path outside the workspace. The plugin will then write `heartbeat-state.json`, `capture-ledger.json`, and ingestion ledgers to arbitrary filesystem locations. The `resolvePath` fallback `(p) => p` (index.ts:12) performs no validation when the host does not supply one. Even when the host does supply `resolvePath`, the plugin does not validate the resolved path is within its scope.

The `InMemoryCaptureLedger` class has an `isWithin()` guard (capture-ledger.ts:4-8), but it only protects the capture ledger path — `heartbeat-state.json`, `ingestion-hash-ledger.json`, and `ingestion-cron-summary-current.json` have no containment check.

**Impact**: Arbitrary file write to attacker-controlled path. In a multi-user install, a malicious plugin config could overwrite or create files outside the intended workspace (OWASP A01 - Broken Access Control).

**Mitigation**: Validate that resolved `stateDir` (and all derived state paths) are contained within the plugin workspace scope. Apply the existing `isWithin()` pattern from `capture-ledger.ts` to all state-path writes, or add a centralized path-containment check in `register()` after `resolvePath` resolves all paths.

### B2 — No path-traversal validation on `ingestion.rootDir` (confidence: 78)

**Location**: `src/config.ts:86`, `openclaw.plugin.json:528-530`

**Evidence**:
```typescript
// config.ts:86
rootDir: String(cfg.ingestion?.rootDir ?? process.cwd()),
```

The schema allows any string for `rootDir`. The ingestion system (ingestion.ts `collectProfileFiles()`) calls `resolve(profile.rootDir)` and recursively walks the directory.

**Attack vector**: Setting `rootDir: "/etc"` or `rootDir: "../../sensitive-project"` causes the plugin to scan and potentially ingest content from directories outside the intended scope. In a multi-user install, this could exfiltrate file contents to the Bonfires API.

**Impact**: Information disclosure via file-content exfiltration (OWASP A01 - Broken Access Control). Content from arbitrary directories would be sent to the external Bonfires API endpoint via `client.ingestContent()`.

**Mitigation**: Add a path-containment check for `rootDir` relative to the plugin workspace. At minimum, reject absolute paths and `..` components unless explicitly allowed by configuration. The same applies to per-profile `rootDir` in `ingestion.profiles.*`.

---

## 3. Non-blocking findings

### NB1 — `agents` schema uses open `additionalProperties` without key-format constraint (confidence: 62)

**Location**: `openclaw.plugin.json:467-471`

**Evidence**:
```json
"agents": {
  "type": "object",
  "additionalProperties": { "type": "string" }
}
```

The `agents` map accepts any key string. This is functionally correct (spec says "mapping of local agent IDs to Bonfires agent IDs"), but unlike `ingestion.profiles` keys (which are validated with `/^[a-zA-Z0-9_-]+$/` at config.ts:25), agent mapping keys have no format constraint. This is intentional from a flexibility perspective, but inconsistent with the profile key hardening.

**Impact**: Low. An adversarial agent key with special characters could cause log-injection or unexpected behavior in downstream consumers. No concrete exploit path demonstrated.

**Mitigation**: Consider adding the same alphanumeric+hyphen+underscore pattern to agent mapping keys for consistency. Non-blocking.

### NB2 — Timer stop mechanism is flag-based, not clearTimeout-based (confidence: 55)

**Location**: `src/heartbeat.ts` (tick loop), `src/ingestion.ts` (tick loop)

**Evidence**: Both `startStackHeartbeat` and `startIngestionCron` return `() => { stopped = true }` rather than calling `clearTimeout()`. After `dispose()`, an in-flight `tick()` will complete its current iteration before observing the `stopped` flag.

**Impact**: Low. There is a race window where one final tick runs after `dispose()`. The `.unref()` calls prevent process-exit blocking. This is defense-in-depth concern, not an active exploit. In the worst case, a single extra API call is made after shutdown.

**Mitigation**: Store the timeout handle and call `clearTimeout(handle)` in the stop function in addition to setting the flag, for deterministic shutdown. Non-blocking.

### NB3 — No wave-7 tests for path-traversal rejection (confidence: 68)

**Location**: `tests/wave7-packaging.test.ts`

**Evidence**: The wave-7 tests cover env fallbacks, stateDir configurability, schema field presence, lifecycle dispose, and idempotent dispose. There are no tests that verify rejection of path-traversal inputs for `stateDir`, `ingestion.rootDir`, `ledgerPath`, or `summaryPath`. The `baseUrl` domain-pin is tested in wave-1 (wave1.test.ts:148-152), but analogous containment for filesystem paths is absent.

**Impact**: Regression risk. If path validation is added (per B1/B2), it needs test coverage. Current absence means any future validation could be silently removed.

**Mitigation**: Add tests that assert `parseConfig` or `register` rejects `stateDir: "../../etc"` and `ingestion.rootDir: "/etc"`. Non-blocking (follows from B1/B2 remediation).

---

## 4. Required remediations

| ID | Finding | Required before merge |
|----|---------|----------------------|
| B1 | `stateDir` path traversal | Add containment validation for all resolved state paths (stateDir, heartbeat-state, ingestion ledger/summary). Apply `isWithin()` or equivalent against plugin scope root. |
| B2 | `ingestion.rootDir` path traversal | Add containment check for `rootDir` and per-profile `rootDir`. Reject paths that resolve outside the workspace scope. |

Both remediations should include corresponding test coverage (see NB3).

---

## 5. Proof of review

### Commands run / artifacts inspected

| Action | Detail |
|--------|--------|
| Read full diff | `diff-wave-7-212d12f.patch` (877 lines, 12 files) |
| Read spec | `plugin-packaging-and-openclaw-integration.md` (PM5-R1 through PM5-R6) |
| Read guidance | `guidance-for-plugin-packaging-and-openclaw-integration.md` |
| Read wave-7 summary | `wave-7-summary.json` (gate:all pass, verify:hosted pass) |
| Read current source | `src/config.ts` (full, 150 lines), `src/index.ts` (full, 68 lines) |
| Read manifest | `openclaw.plugin.json` (109 lines, via diff) |
| Read tests | `tests/wave7-packaging.test.ts` (220 lines, via diff) |
| Searched lifecycle internals | `src/heartbeat.ts`, `src/ingestion.ts` — return types, stop mechanism, error handling, `.unref()` usage |
| Searched credential paths | `src/bonfires-client.ts`, `hosted-integration-verify.ts` — `redactEnvSummary()`, header-only key usage |
| Searched path validation | `src/capture-ledger.ts` `isWithin()` — only covers capture ledger path, not other state paths |
| Cross-checked test coverage | `tests/wave1.test.ts` baseUrl pin tests; no traversal tests in wave7 |
| Verified `.gitignore` | `.bonfires-state/` excluded from version control |

### Why Security/Attacker lens fits this diff

This wave adds: (a) a plugin manifest with a JSON Schema config surface, (b) env-variable fallback paths that handle secrets, (c) user-configurable filesystem paths for state and ingestion, (d) lifecycle hooks that manage background timers. Each of these is a trust boundary — config inputs come from operators who may misconfigure or from compromised config files, env vars carry secrets, filesystem paths can escape scope, and timers can leak resources. The security lens is the right tool to evaluate these boundaries.

### Trust boundaries identified

1. **Config input boundary**: `openclaw.plugin.json` schema -> `parseConfig()` -> runtime behavior. User-supplied `stateDir`, `rootDir`, `ledgerPath`, `summaryPath` cross from untrusted config to filesystem operations.
2. **Environment variable boundary**: `process.env.BONFIRES_BASE_URL`, `BONFIRES_API_KEY_ENV`, `BONFIRE_ID` -> runtime config. The API key is accessed via indirection (`process.env[apiKeyEnv]`), never serialized.
3. **Filesystem write boundary**: Plugin writes state files to `stateDir`-derived paths. Containment depends on host `resolvePath` (not validated by plugin).
4. **Network boundary**: `baseUrl` is pinned to `*.bonfires.ai` via HTTPS + domain check (config.ts:100-104). API key transmitted only in Authorization header.
5. **Timer lifecycle boundary**: `register()` -> `startStackHeartbeat()` / `startIngestionCron()` -> `dispose()`. Orphan risk mitigated by `.unref()` + flag-based stop.

### OWASP Top 10 check against diff

| Category | Checked | Finding |
|----------|---------|---------|
| A01 Broken Access Control | Yes | B1, B2 — path traversal on state/ingestion paths |
| A02 Cryptographic Failures | Yes | No issues — no crypto in diff; API key handled via env indirection |
| A03 Injection | Yes | No SQL/command injection vectors; config values are typed/validated |
| A04 Insecure Design | Yes | Manifest schema is strict (`additionalProperties: false`); NB1 notes minor gap |
| A05 Security Misconfiguration | Yes | Env fallback precedence is clear and documented |
| A06 Vulnerable Components | Yes | No new dependencies added |
| A07 Auth Failures | Yes | Not applicable — plugin trusts host auth |
| A08 Data Integrity Failures | Yes | No deserialization of untrusted objects |
| A09 Logging Failures | Yes | Credential redaction verified; error messages reference env-var names only |
| A10 SSRF | Yes | `baseUrl` domain-pinned to `*.bonfires.ai` + HTTPS enforced |

### Anti-gaming observations

- The diff is coherent: all 12 files serve the stated PM5-R1 through PM5-R6 objectives. No unrelated changes are bundled.
- Planning artifacts under `.ai/log/plan/` are included in the commit but are inert (no runtime behavior). The wave-7-summary.json caveat correctly notes this.
- Test file covers manifest structure, env fallbacks, stateDir configurability, and lifecycle dispose. Tests are not trivially self-satisfied — env cleanup in `finally` blocks prevents test pollution.
- The `agents` field is `required` in the schema and validated at runtime (config.ts:96) — not a paper-only constraint.
- The `dispose()` return is tested for existence and idempotency but not for actual timer cancellation (acceptable given `.unref()` safety net).

---

## 6. Diff acknowledgement

I have reviewed the complete `diff-wave-7-212d12f.patch` (commit 212d12f, 877 lines, 12 files changed: +621/-35). All security-relevant files were read in full: `openclaw.plugin.json`, `src/config.ts`, `src/index.ts`, `tests/wave7-packaging.test.ts`, `.gitignore`, `package.json`, and the README.md changes. Supporting source files (`src/heartbeat.ts`, `src/ingestion.ts`, `src/capture-ledger.ts`, `src/bonfires-client.ts`) were read to trace trust boundaries beyond the diff surface.
