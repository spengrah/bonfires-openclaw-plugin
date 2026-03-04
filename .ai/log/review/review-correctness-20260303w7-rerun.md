---

# Correctness Review — Wave 7 (bonfires-plugin)

**Diff**: `diff-wave-7-212d12f.patch` (commit `212d12f`, 12 files, +621/−35)
**Reviewer**: Correctness lens
**Date**: 2026-03-03

---

## 1) Verdict

**GO** — Confidence: **high (92%)**

All six acceptance criteria are met. The implementation faithfully translates spec requirements PM5-R1 through PM5-R6 into code, tests, and documentation. No blocking correctness defects found. Two minor non-blocking observations noted below. Gate suite passes (108/108 tests, 93.4% line coverage, 100% changed-line coverage).

---

## 2) Blocking findings

None.

---

## 3) Non-blocking findings

### NB-1: `openclaw.plugin.json` configSchema drifted from runtime config.ts (minor, cosmetic)

The `openclaw.plugin.json` manifest in the diff (as committed in wave 7) does not include the `profiles`, `agentProfiles`, or `defaultProfile` sub-properties under `ingestion`. However, the live `openclaw.plugin.json` on disk (post-wave-8 amendments) does include them. This means the wave-7 diff itself is internally consistent — the manifest matched the wave-7 scope. Subsequent waves (wave 8/PM6) correctly extended it. No correctness issue, but reviewers should note this artifact of incremental wave commits.

### NB-2: `bonfireId` fallback already existed pre-wave-7

The diff shows that `bonfireId` already had `process.env.BONFIRE_ID` fallback in the pre-wave-7 config (`cfg.bonfireId ?? process.env.BONFIRE_ID ?? ''`). Wave 7 did not change this line — it was already correct. The new wave-7 env fallbacks for `baseUrl` and `apiKeyEnv` are the actual additions. Not a defect; just noting for traceability that `bonfireId` env support pre-dates this wave.

### NB-3: `parseConfig` called with `{ logger }` opts in current `index.ts` but wave-7 diff shows call without opts

The live `index.ts:10` reads `parseConfig(api.pluginConfig ?? {}, { logger: api.logger })` but the wave-7 diff patch shows the call as `parseConfig(api.pluginConfig ?? {})` without the logger opts. This is a post-wave-7 change (likely wave 8). The wave-7 diff is internally self-consistent. No correctness defect.

---

## 4) Required remediations

None. All findings are non-blocking.

---

## 5) Proof of review

### Commands run / artifacts inspected

| Action | Target | Result |
|---|---|---|
| Read full diff | `diff-wave-7-212d12f.patch` (877 lines, 5 chunks) | Complete |
| Read spec | `plugin-packaging-and-openclaw-integration.md` (PM5-R1..R6) | All 6 requirements mapped |
| Read guidance | `guidance-for-plugin-packaging-and-openclaw-integration.md` | Concern signals checked |
| Read wave-7 plan | `wave-7-plan-20260302w7a.md` | Scope matches diff |
| Read wave-7 summary | `wave-7-summary.json` | `gate:all` PASS, `verify:hosted` PASS |
| Read live `src/config.ts` | Current file (150 lines) | Env fallback chains verified |
| Read live `src/index.ts` | Current file (68 lines) | `stateDir`-based paths, `dispose()` handle present |
| Read live `openclaw.plugin.json` | Current file (149 lines) | Schema strict, all fields present |
| Read live `package.json` | Current file (33 lines) | `openclaw.extensions.plugin` present |
| Read live `README.md` | Current file (277 lines) | All six doc sections present |
| Read live `.gitignore` | Current file (18 lines) | `.bonfires-state/` excluded |
| Grep `src/` for `.ai/log` | All runtime source | **Zero matches** — runtime decoupled from planning paths |
| Grep `README.md` for `.ai/log/plan` | Two hits | Both are dev-time references (disclaimer + verify:hosted report), not runtime state paths |
| Read `startStackHeartbeat` return | `src/heartbeat.ts:243` | Returns `() => { stopped = true; }` |
| Read `startIngestionCron` return | `src/ingestion.ts:305` | Returns `() => { stopped = true; }` |
| Read test file | `tests/wave7-packaging.test.ts` (220 lines) | 19 wave-7 tests covering PM5-R1,R2,R4,R5 |
| Verify gate report | `verification-gates-report-current.json` | 108/108 pass, 93.4% coverage |

### Why correctness lens fits this diff

This wave is primarily a packaging/integration hardening pass. The correctness lens is appropriate because:
- Env fallback precedence chains must be logically correct (config > env > default) — verified by reading the `??` chain in `config.ts:74-76` and by 7 dedicated tests (tests 95–101).
- State path migration from `.ai/log/plan/*` to `cfg.stateDir/*` must be complete across all runtime paths — verified by grep showing zero `.ai/log` references in `src/`.
- Lifecycle `dispose()` must actually stop running loops — verified by tracing return values from `startStackHeartbeat` and `startIngestionCron` through to the `dispose()` handle.
- Plugin manifest schema must match runtime expectations — verified field-by-field against `parseConfig`.

### Anti-gaming observations

- **Tests are not tautological**: Wave-7 tests exercise actual `parseConfig` with env manipulation (save/restore pattern) and `register` with mock API objects. Tests 95-100 specifically test the `??` fallback chain by setting env vars and asserting precedence. Tests 107-108 exercise the actual `register` function and call `dispose()`.
- **No `process.env.NODE_ENV` or test-only branches** in the changed source code. Config behavior is identical in all environments.
- **No `.only` or `.skip` in test file** — all 19 wave-7 tests run.
- **Coverage metrics are genuine**: Changed-line coverage is 100% of 22 changed lines. The low line count reflects the fact that wave-7 changes are small, focused additions to existing files.
- **Gate report shows mutation-lite PASS**: 3 mutation probes caught by tests (one probe skipped due to target refactoring — this is pre-existing and unrelated to wave 7).

---

## 6) Diff acknowledgement

I have reviewed the complete diff for commit `212d12f` (877 lines across 12 files: 5 planning artifacts, 1 .gitignore, 1 README, 1 manifest, 1 package.json, 2 source files, 1 test file). The diff is a single commit authored by `lyle <code@spengrah.xyz>` on 2026-03-02. The commit message accurately describes the scope (PM5-R1 through PM5-R6). All changes are within the declared wave-7 scope. No out-of-scope behavioral changes detected. The diff cleanly maps to the spec requirements and the wave-7 plan.
