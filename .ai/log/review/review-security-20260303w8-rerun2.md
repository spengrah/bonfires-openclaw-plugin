# Security Review — bonfires-plugin — Wave 8 rerun2 (post-correctness pass)

## Diff acknowledgement
Reviewed commit **`f7b28b8`** using primary diff artifact:
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/diff-wave-8-pm6-r2-remediation-f7b28b8.patch`

Also reviewed required context:
- Wave plan: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/wave-8-plan-20260303w8a.md`
- Verification matrix: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-matrix-wave-8-20260303w8a.md`
- Gate report: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-gates-report-current.json`
- Prior correctness review: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/review-correctness-20260303w8-rerun2.md`
- PM6 spec/guidance:
  - `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/spec/spec/content-ingestion/ingestion-target-profiles-and-agent-mapping.md`
  - `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/spec/guidance/content-ingestion/guidance-for-ingestion-target-profiles-and-agent-mapping.md`

## Verdict
**GO**

## Confidence
**89/100**

## Summary
Security-relevant changes in this remediation are primarily around configuration validation and runtime profile selection failure behavior. The patch **reduces** risk of unintended ingestion by replacing silent fallback behavior with explicit errors when profile selectors are configured incorrectly. I found **no exploitable security regressions** or newly introduced injection/auth/secret exposure paths at confidence ≥70.

## Trust boundaries identified in diff
1. **Plugin config boundary** (untrusted/operator-provided config) → `parseConfig(...)` in `src/config.ts`.
2. **Runtime identity boundary** (`activeAgentId` from host runtime) → profile selection logic in `runIngestionOnce(...)`.
3. **Filesystem boundary** (profile `rootDir` and scanned file tree) → `collectProfileFiles(...)`.
4. **External service boundary** (ingested payload leaving process) → `client.ingestContent(...)`.
5. **Logging boundary** (errors emitted to warning logs) → `startIngestionCron` catch path.

## Findings
### No reportable findings (confidence >= 70)
No injection, authz/authn bypass, secret leak, or high-confidence path/file exploit was identified in the changed code.

## Substantive security analysis

### 1) Attack surface changes introduced by this diff
- New validation in `parseConfig` rejects `agentProfiles/defaultProfile` when no profiles exist (`src/config.ts:47-52`).
- Runtime path now enforces explicit failure if profile selectors are configured but profile table is absent (`src/ingestion.ts:192-197`).
- Runtime profile resolution chooses mapped profile or default and throws when unresolved (`src/ingestion.ts:208-219`).
- Cron wiring now forwards `defaultProfile` into ingestion runtime (`src/index.ts:37-50`, `src/ingestion.ts:325-326`).

**Security effect:** removes ambiguous fallback behavior that could otherwise ingest from unintended legacy locations.

### 2) Input validation and untrusted input tracing
- Config-controlled selectors (`agentProfiles`, `defaultProfile`) are parsed/validated in `parseConfig` and references are checked against defined profiles (`src/config.ts:54-60`).
- Runtime selector inputs flow as:
  - `cfg.ingestion.defaultProfile` → `startIngestionCron` options (`src/index.ts:37-50`) → `runIngestionOnce` (`src/ingestion.ts:325-326`).
  - `activeAgentId` + `agentProfiles` → selected profile name (`src/ingestion.ts:210-214`).
- Unresolved selection fails fast with explicit error (`src/ingestion.ts:218`).

**Assessment:** validation/fail-fast behavior is security-positive and prevents silent broad-scope ingest behavior.

### 3) Error handling / data exposure review
- New errors include profile names only (e.g., `Configured ingestion profile "..." was not found`), no API keys/tokens/content body exposure.
- Cron catches and logs sanitized message string (`src/ingestion.ts:328-329`).

**Assessment:** no new sensitive-data leak introduced in changed paths.

### 4) Path/file risk review
- The changed code does not add new file read/write primitives; it changes profile selection semantics only.
- `collectProfileFiles` still resolves `rootDir` and scans under that root (`src/ingestion.ts:134-141`).
- Result labels include `profileName:relativePath` (`src/ingestion.ts:166`), which improves attribution and does not increase write-surface.

**Assessment:** no new traversal primitive introduced by this diff. Existing filesystem behavior remains bounded by configured roots.

### 5) Authentication/authorization/privilege review
- No auth/authz logic is modified in this patch.
- No role or privilege checks removed.

**Assessment:** no privilege escalation path introduced.

### 6) OWASP Top 10 categories checked against this diff
- **A01 Broken Access Control:** checked; no new access-control logic introduced.
- **A02 Cryptographic Failures:** checked; no crypto handling changed.
- **A03 Injection:** checked config-to-runtime flows and error/log construction; no injection sink added.
- **A04 Insecure Design:** checked fallback behavior; design improved via explicit failure.
- **A05 Security Misconfiguration:** checked profile selector misconfig handling; now fail-fast.
- **A06 Vulnerable/Outdated Components:** no dependency changes in diff.
- **A07 Identification/Authentication Failures:** no changes.
- **A08 Software/Data Integrity Failures:** no code-loading/integrity changes.
- **A09 Security Logging/Monitoring Failures:** checked logging path; no sensitive payload exposure added.
- **A10 SSRF:** no new network endpoint construction from untrusted data in changed lines.

## Required before merge
- None.

## Verification actions
- Static diff review focused on `src/config.ts`, `src/index.ts`, `src/ingestion.ts`, and `tests/wave8-profiles.test.ts`.
- Cross-checked PM6-R2 security implications against wave plan/spec/guidance.
- Reviewed gate report for evidence of regression coverage (including new wave8 runtime-selector tests).

## Proof of review

### Files inspected
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/diff-wave-8-pm6-r2-remediation-f7b28b8.patch`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/config.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/ingestion.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/index.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/tests/wave8-profiles.test.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/wave-8-plan-20260303w8a.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-matrix-wave-8-20260303w8a.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-gates-report-current.json`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/review-correctness-20260303w8-rerun2.md`

### Commands run
- `nl -ba src/config.ts | sed -n '1,140p'`
- `nl -ba src/ingestion.ts | sed -n '1,170p'`
- `nl -ba src/ingestion.ts | sed -n '150,380p'`
- `nl -ba src/index.ts | sed -n '1,120p'`

### Input source → usage tracing evidence
- `cfg.ingestion.defaultProfile` parse + propagation:
  - `src/config.ts:45`
  - `src/index.ts:37,49`
  - `src/ingestion.ts:185,193,212-214,325`
- `cfg.ingestion.agentProfiles` parse + runtime mapping use:
  - `src/config.ts:38-43,56-57`
  - `src/index.ts:36,48`
  - `src/ingestion.ts:184,192,210-211,324`
- `activeAgentId` runtime selector use:
  - `src/ingestion.ts:186,193,210`

### Secret handling paths examined
- Error/logging strings in changed code (`src/ingestion.ts:218,328-329`) inspected for secret disclosure.
- No API key/env value concatenation or raw payload logging introduced in changed lines.

### Exploitation tests run
- No live exploit command run; static analysis judged sufficient because changes are fail-fast validation and selection wiring, and corresponding negative-path tests are present in `tests/wave8-profiles.test.ts`.
