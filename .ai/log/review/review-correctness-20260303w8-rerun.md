# Correctness Review — bonfires-plugin — Wave 8 rerun

## Diff acknowledgement
Reviewed commit `0ee3446` via patch artifact:
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/diff-wave-8-codeonly-0ee3446.patch`

Scope reviewed against:
- Wave plan: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/wave-8-plan-20260303w8a.md`
- Verification matrix: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-matrix-wave-8-20260303w8a.md`
- Gate report: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-gates-report-current.json`
- PM6 spec/guidance:
  - `.ai/spec/spec/content-ingestion/ingestion-target-profiles-and-agent-mapping.md`
  - `.ai/spec/guidance/content-ingestion/guidance-for-ingestion-target-profiles-and-agent-mapping.md`

## Verdict
**NO_GO**

## Confidence
**95/100** (high-confidence, spec-conformance correctness regression)

## Summary
Wave 8 introduces profile config structures and tests, but runtime ingestion behavior does not actually enforce PM6-R2 mapping/default semantics. In configurations where profiles are absent or misconfigured, runtime can silently fall back to legacy hardcoded directory scanning instead of failing explicitly as required. This is a correctness/spec-conformance defect with direct behavioral impact.

## Findings

### 1) PM6-R2 mapping/default failure path is not enforced at runtime (silent legacy fallback)
- **Location:**
  - `src/ingestion.ts:188-204`
  - `src/index.ts:38-48`
  - `src/config.ts:47-53`
  - Spec requirement: `.ai/spec/spec/content-ingestion/ingestion-target-profiles-and-agent-mapping.md` (PM6-R2 #2/#3)
- **What’s wrong:**
  Runtime ingestion chooses mode solely by `hasProfiles` and falls back to `collectIngestionFiles(rootDir)` when no profiles are present (`src/ingestion.ts:188-204`). The explicit PM6-R2 resolver (`resolveIngestionProfile`) exists but is never used in runtime paths (only unit-tested directly). Parse-time validation of `agentProfiles/defaultProfile` is gated behind `if (Object.keys(profiles).length > 0)` (`src/config.ts:47-53`), so invalid/missing profile setup can pass config parsing and still run ingestion in legacy mode.
- **Why it matters (runtime impact):**
  This violates PM6-R2 requirement 3: ingestion should fail with explicit config error when no mapping/default exists, not silently ingest from implicit hardcoded locations. In practice, misconfigured deployments can ingest unexpected data from `memory/vault/projects` under `rootDir`/`cwd` rather than failing fast.
- **Confidence:** 95
- **Suggested fix:**
  Enforce PM6-R2 in runtime ingestion entrypoint:
  1. Validate that when ingestion is enabled in wave-8 profile mode, either agent mapping or default profile resolution is possible per active agent context.
  2. Remove/guard silent fallback to legacy collector when profile-mode fields (`agentProfiles`, `defaultProfile`) are present but `profiles` is empty.
  3. Optionally require parse-time error if `agentProfiles` or `defaultProfile` is supplied without at least one `profiles` entry.

## Acceptance criteria check (PM6)
- **PM6-R1 (profile config model):** **PASS** — profile parsing and per-profile file collection implemented (`src/config.ts`, `src/ingestion.ts`), tests present.
- **PM6-R2 (agent→profile mapping + default + explicit failure):** **FAIL** — resolver exists (`src/config.ts:118+`) but not wired into ingestion runtime; explicit runtime failure semantics not enforced (`src/ingestion.ts:188-204`).
- **PM6-R3 (legacy migration):** **PASS** — `_legacy` profile synthesis + deprecation warning path present.
- **PM6-R4 (safety defaults + extension defaults + dedupe continuity):** **PASS with note** — defaults and extension filtering present; existing tests cover dedupe continuity in tested scenarios.
- **PM6-R5 (operability summaries/docs):** **PASS** — summary includes profile/agent dimensions; README examples updated.

## Edge cases considered
- `ingestion.agentProfiles` set but `ingestion.profiles` omitted.
- `ingestion.defaultProfile` set to name while profiles absent.
- ingestion enabled with profiles empty causing implicit legacy collector activation.
- unknown agent mapping/default fallback behavior versus stated README/spec resolution contract.
- legacy mode coexistence with new fields and migration path behavior.

## Required before merge
1. Wire PM6-R2 resolution/failure behavior into runtime ingestion path (not test-only helper).
2. Prevent silent legacy fallback when new mapping/default fields are present but profile config is incomplete.
3. Add integration test proving explicit failure (not fallback) when mapping/default cannot resolve in active ingestion mode.

## Verification actions
- Static diff and surrounding-code review performed.
- Cross-checked implementation against PM6 spec and guidance.
- Cross-checked tests for coverage gaps between unit helper behavior and runtime wiring.

## Proof of review
### Files read
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/diff-wave-8-codeonly-0ee3446.patch`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/wave-8-plan-20260303w8a.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-matrix-wave-8-20260303w8a.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-gates-report-current.json`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/spec/spec/content-ingestion/ingestion-target-profiles-and-agent-mapping.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/spec/guidance/content-ingestion/guidance-for-ingestion-target-profiles-and-agent-mapping.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/config.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/ingestion.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/index.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/tests/wave8-profiles.test.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/README.md`

### Commands run
- `grep -RIn "PM6\|agentProfiles\|defaultProfile\|ingestion profiles\|profile-based" .ai/spec README.md src tests | head -n 200`
- `nl -ba src/config.ts | sed -n '1,240p'`
- `nl -ba src/ingestion.ts | sed -n '160,340p'`
- `nl -ba src/index.ts | sed -n '1,140p'`
- `grep -RIn "resolveIngestionProfile" src tests | cat`

### Gate/test evidence consulted
- Gate report indicates all declared gates and tests passed, including wave8 tests; this review specifically identifies a runtime conformance gap not caught by current gate assertions.
