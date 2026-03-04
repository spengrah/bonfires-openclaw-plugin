# Review: Verification Quality — Wave 7 (bonfires-plugin)

- **Reviewer**: tz:reviewer (Verification Quality lens)
- **Diff**: `diff-wave-7-212d12f.patch` (commit 212d12f)
- **Date**: 2026-03-03
- **Wave summary**: `wave-7-summary.json`
- **Gate report**: `verification-gates-report-current.json` (in-diff snapshot + post-wave-8 current)

---

## 1) Verdict

**GO** — confidence **90/100**

All verification gates exercised wave-7 changes substantively at commit time. The wave-7-time gate results (extracted from the diff-embedded update to `verification-gates-report-current.json`) show: 100% changed-lines coverage of 22 source lines, 2 critical modules verified with happy/negative/edge checks, 5 requirements traced, and diff-escalation active for `src/index.ts`. Tests are non-vacuous with meaningful assertions covering env fallback precedence, schema strictness, state path derivation, and lifecycle dispose. No anti-gaming signals detected. Minor gaps in mutation probe specificity and doc verification automation do not undermine verification integrity.

---

## 2) Blocking Findings

None.

---

## 3) Non-blocking Findings

### NB-1: Dispose tests verify interface contract but not behavioral stop (confidence: 65)

**Location**: `tests/wave7-packaging.test.ts` lines 184-220 (tests 107-108)

**What's wrong**: The PM5-R5 dispose tests confirm that `register()` returns a `{ dispose }` handle and that `dispose()` is callable and idempotent. However, they do not verify that calling `dispose()` actually invokes the `stopHeartbeat()` and `stopIngestion()` stop functions. In the test configuration (`apiKeyEnv: 'NO_SUCH_ENV'`, ingestion not enabled), `stopHeartbeat` is truthy (heartbeat always starts) but `stopIngestion` may be undefined (ingestion disabled by default). The `?.()` optional-chaining in `src/index.ts:64-65` means `dispose()` safely no-ops for the undefined case, so the test passes without exercising the actual stop path for ingestion.

**Acceptance criterion at risk**: PM5-R5 ("lifecycle-managed loops -- start/stop behavior deterministic in tests"). The "deterministic stop" aspect is tested at the interface level but not fully at the behavioral level.

**Suggested fix**: Add a spy or counter on the stop functions returned by `startStackHeartbeat` / `startIngestionCron` and assert they were called during `dispose()`. Alternatively, enable ingestion in the test config and verify both stop functions are truthy. Deferrable -- the interface contract and optional-chaining safety provide adequate protection.

### NB-2: Mutation-lite probes do not specifically target wave-7 logic (confidence: 62)

**Location**: `scripts/gates/mutation-lite-check.ts` probe set (4 probes, 1 skipped)

**What's wrong**: The mutation probes target: (1) agents validation in parseConfig, (2) empty-prompt guard in hooks, (3) fetchJson error handling (skipped -- target not found), (4) capture message loop. None probe wave-7-specific additions: the env-fallback chains (`cfg.baseUrl ?? process.env.BONFIRES_BASE_URL ?? default`), the `stateDir` parsing, or the `dispose()` lifecycle handle. The wave-7 unit tests DO cover these paths substantively (env fallback tests manipulate env vars and assert precedence), so the gap is in mutation-level verification, not test existence.

**Acceptance criterion at risk**: PM5-R2 (env fallbacks) -- mutation-level confidence only, not test-level confidence.

**Suggested fix**: Consider adding a probe targeting the env-fallback chain, e.g.: find `process.env.BONFIRES_BASE_URL ??` / replace with empty string. This would confirm tests catch regressions to new fallback logic. Low priority -- the quality gate already verified happy/negative/edge coverage for config.ts via wave7-packaging.test.ts.

### NB-3: PM5-R3 and PM5-R6 rely on manual doc verification (confidence: 52)

**Location**: Verification matrix rows PM5-R3 (heartbeat distinction docs) and PM5-R6 (install/operator docs)

**What's wrong**: These requirements are verified by "manual doc pass" and lint. The lint gate checks markdown syntax (33 files checked, PASS) but not semantic content. No automated gate verifies that README sections contain the heartbeat comparison table, install paths, or troubleshooting steps.

**Acceptance criterion at risk**: PM5-R3 and PM5-R6 could pass gates even if documentation content were incomplete or regressed in a future wave.

**Suggested fix**: Inherent to documentation requirements -- automated semantic verification is impractical without brittle string matching. The spec review (`specrev-wave-7-20260302w7a-r1.md`, verdict: GO) confirms content was reviewed. Acceptable as-is.

---

## 4) Required Remediations

None. All findings are non-blocking and advisory.

---

## 5) Proof of Review

### Artifacts inspected

| Artifact | Path | Purpose |
|---|---|---|
| Wave-7 diff | `.ai/log/review/diff-wave-7-212d12f.patch` | Full patch (12 files, 621+/35-), read in full via chunked reads |
| Wave-7 summary | `.ai/log/plan/wave-7-summary.json` | Commit SHA, gate:all pass, verify:hosted pass, 7 changed files |
| Current gates report | `.ai/log/plan/verification-gates-report-current.json` | Post-wave-8 gate results (135 tests, all PASS); used for cross-reference |
| Wave-7 gates (diff-embedded) | `+` lines in diff hunk for `verification-gates-report-current.json` (patch lines 56-145) | **Primary gate evidence**: wave-7-time results (108 tests, all PASS) |
| Verification matrix | `.ai/log/plan/verification-matrix-wave-7-20260302w7a.md` | 7 requirement-to-gate mapping rows |
| Implementation prompt | `.ai/log/plan/wave-7-impl-prompt.txt` | Scope constraints, verification requirements |
| VQ lens skill | `skills/lens-vq/SKILL.md` | Lens methodology and verdict criteria |
| Source: config.ts diff | Patch lines 568-600 | Env fallback chains, stateDir field, ingestion path defaults |
| Source: index.ts diff | Patch lines 601-651 | State path wiring, dispose handle, captured stop functions |
| Test file | `tests/wave7-packaging.test.ts` (220 lines, 19 tests) | Full diff at patch lines 652-878 |
| Manifest | `openclaw.plugin.json` (109 lines, new) | Full diff at patch lines 437-551 |
| Package metadata | `package.json` (+5 lines) | Patch lines 552-567 |
| Gitignore | `.gitignore` (+3 lines) | Patch lines 253-263 |
| README | `README.md` (+145/-8 lines) | Patch lines 264-436 |
| AGENTS.md | Reviewer trust zone directives | Role constraints, confidence policy, output contract |
| USER.md | Principal alignment | Spencer's operating principles |

### Gate report analysis (tiers 0-4)

**Methodology note**: The `verification-gates-report-current.json` at HEAD reflects post-wave-8 state with several vacuous passes (e.g., "no changed source lines"). The **wave-7-time gate results** embedded in the diff's modification of this file are the authoritative evidence for this review.

| Gate | Tier | Wave-7-time result | Vacuous? | Assessment |
|---|---|---|---|---|
| lint | 1 | PASS -- 33 markdown files checked (was 32) | No | New specrev doc validated; TypeScript type-checked |
| test:coverage | 2 | PASS -- **108 tests, 0 fail** (was 89) | No | +19 wave-7 tests all passing |
| gate:coverage | 2 | PASS -- global 93.4% (was 93.3%) | No | Coverage maintained with new code |
| gate:changed-lines | 2 | PASS -- **100.0% of 22 changed lines** | No | Every changed source line in config.ts and index.ts covered |
| gate:quality | 3 | PASS -- 2 critical modules (config.ts, index.ts), happy/neg/edge=true | No | Both changed modules verified; wave7-packaging.test.ts in test_files list |
| gate:mutation-lite | 3 | PASS -- 3/4 probes caught, 1 skipped (target not found) | No* | Probes ran substantively; skip is for bonfires-client.ts (not in wave-7). See NB-2 |
| gate:traceability | 4 | PASS -- **5 touched requirements verified** | No | Requirements traced through to test evidence |
| gate:diff-escalation | 0 | PASS -- **src/index.ts flagged sensitive**, Tier 3+4 mandatory, all met | No | Correctly escalated; all escalation requirements satisfied |
| gate:anti-gaming | 0 | PASS -- 8 source files scanned | No | Full source scan, no exclusions |

\* Probes caught but none specifically target wave-7 additions. See NB-2.

### Vacuous pass cross-reference

The current (post-wave-8) gates report shows several vacuous results:
- `gate:changed-lines`: "no changed source lines -- PASS" (vacuous; HEAD has no uncommitted changes)
- `gate:quality`: "no critical modules touched -- PASS" (vacuous; wave-8 didn't touch critical modules)
- `gate:traceability`: "no requirements touched -- PASS" (vacuous; wave-8 context)
- `gate:diff-escalation`: "no sensitive files touched -- PASS" (vacuous; wave-8 context)

**None of these reflect wave-7 gate quality.** The wave-7-time results embedded in the diff show substantive passes across all tiers. No suspicious vacuous passes on wave-7 logic.

### Test non-vacuity analysis

| Requirement | Tests | Key assertions | Non-vacuous? |
|---|---|---|---|
| PM5-R1 (manifest + package) | 90-94 (5 tests) | Schema `type: 'object'`, `additionalProperties: false`, `id === 'bonfires-plugin'`, all 10 config fields enumerated, nested objects locked, `openclaw.extensions.plugin` type-checked | Yes -- structural and value assertions, not just existence |
| PM5-R2 (env fallbacks) | 95-101 (7 tests) | 3 fields x (env fallback + explicit override) + defaults test; env vars saved/restored in try/finally; exact string equality asserts | Yes -- exercises full precedence chain per field |
| PM5-R4 (state paths) | 102-106 (5 tests) | `stateDir === '.bonfires-state'` default, custom override, derived paths start with stateDir, explicit paths override derivation | Yes -- tests 3-level derivation chain |
| PM5-R5 (lifecycle) | 107-108 (2 tests) | `typeof handle.dispose === 'function'`, dispose callable, dispose idempotent (called twice) | Partial -- interface verified, behavioral stop not asserted (NB-1) |
| PM5-R3/R6 (docs) | Lint + manual | Markdown syntax check (33 files) | Appropriate for doc requirements |

### Anti-gaming observations

1. **No test exclusions**: No `skip()`, `only()`, `todo`, or conditional bypasses in wave-7 tests.
2. **No lint disables**: No `eslint-disable`, `@ts-ignore`, `@ts-expect-error` in the diff.
3. **No coverage exclusions**: No `istanbul ignore`, `c8 ignore`, or equivalent pragmas anywhere in the diff.
4. **Gitignore is appropriate**: `.bonfires-state/` is runtime state, not source. Anti-gaming gate confirmed 8 source files still scanned.
5. **No blanket gate exclusions**: All production source files included in quality and coverage scans.
6. **Strict test mode**: Wave-7 tests use `node:assert/strict` (no coercion). Env var tests use try/finally for cleanup.
7. **Consistent naming**: All 19 test names prefixed `wave7:` for traceability.
8. **Coverage denominator check**: 22 changed lines is the correct denominator for `src/config.ts` (~8 lines) + `src/index.ts` (~14 lines); not inflated.
9. **Quality gate picked up wave-7 tests**: The `test_files` field for both critical modules now includes `wave7-packaging.test.ts`, confirming the test file exercises both changed modules.

### Why the VQ lens fits this diff

Wave 7 is a packaging/configuration/lifecycle wave with 22 changed source lines across 2 files and 220 lines of new tests. The verification quality question is critical because:
- Configuration-heavy changes can easily pass vacuous gates if tests only check existence
- Env fallback precedence requires multi-tier assertions, not single-value checks
- Plugin manifest schema needs structural validation (additionalProperties: false)
- Dispose lifecycle needs more than "doesn't throw" testing

All these concerns are addressed by the test suite, with a minor partial exception for dispose behavioral verification (NB-1).

---

## 6) Diff Acknowledgement

I have read the complete diff for commit `212d12f` (wave 7): 12 files changed, 621 insertions, 35 deletions. The patch was read in its entirety across multiple chunked reads covering all 878 lines.

**Changed source files** (production logic):
- `src/config.ts` -- env fallback chains for baseUrl/apiKeyEnv, stateDir field, ingestion path defaults
- `src/index.ts` -- stateDir-based path wiring, captured stop function returns, dispose handle

**New files**:
- `openclaw.plugin.json` -- plugin manifest with strict configSchema
- `tests/wave7-packaging.test.ts` -- 19 targeted tests

**Modified non-source files**:
- `package.json` -- openclaw.extensions entry
- `.gitignore` -- .bonfires-state/ exclusion
- `README.md` -- install, config reference, heartbeat distinction, state docs, troubleshooting
- 5 planning artifacts under `.ai/log/plan/`

Gate scripts were not read directly in this session but their behavior was inferred from the detailed gate outputs in the verification-gates-report-current.json diff hunk (wave-7-time results with specific counts, module lists, and probe details).

No files were skipped or excluded from analysis.
