# Verification Gates v1 — Implementation Plan

Status: Draft for reviewer
Source spec: `.ai/spec/spec/quality/spec-for-verification-gates-v1.md`

## Phase 0 — Baseline + wiring
1. Add/confirm tooling deps in `package.json`:
   - `c8` (coverage)
   - `glob` (changed-file matching) or use git CLI directly
2. Add scripts:
   - `test:coverage` -> run node test suite with coverage output
   - `gate:traceability` -> touched R* mapping check
   - `gate:quality` -> assertion/negative-path heuristics check
   - `gate:changed-lines` -> changed-lines coverage threshold check
   - `gate:critical-branch` -> critical modules branch coverage threshold check
   - `gate:all` -> orchestrates all required gates

## Phase 1 — Gate scripts
Create `scripts/gates/`:
1. `traceability-check.mjs`
   - inputs: git diff, traceability map, requirements index
   - output: fail if touched R* lacks mapped verification
2. `quality-check.mjs`
   - enforce happy/negative/edge test presence for touched critical modules
3. `coverage-check.mjs`
   - parse c8 report JSON
   - enforce global >=70 line
   - enforce critical modules branch >=90
4. `changed-lines-coverage-check.mjs`
   - map changed lines from `git diff -U0`
   - verify changed-line coverage >=90
5. `mutation-lite-check.mjs`
   - run targeted fault probes in critical modules and require test failures
6. `diff-aware-escalation-check.mjs`
   - detect touched security/lifecycle-critical files
   - enforce Tier 3 + Tier 4 as mandatory
   - enforce critical-path branch threshold requirement
   - require VQ rationale field in review artifact metadata
7. `anti-gaming-check.mjs`
   - validate coverage exclusion justifications
   - fail blanket excludes for new production files
   - enforce fail precedence (coverage cannot override mapping/assertion failures)

## Phase 2 — Reviewer lens integration
1. Add lens entry in `skills/dev/references/lens-catalog-v1.md`:
   - `verification-quality`
2. Update reviewer contract docs to require proof fields:
   - commands run
   - artifacts inspected
   - gate relevance rationale
   - explicit gaps/disposition
3. Update default review order to include VQ lens before final GO.

## Phase 3 — Project spec + traceability updates
1. Update `.ai/spec/spec/quality/spec-for-mvp-verification-matrix.md` to include tiered gates and thresholds.
2. Add `.ai/spec/spec/quality/coverage-gates-v1.md` (policy reference extracted from spec).
3. Ensure `traceability-map.json` contains all active requirements (R1..R6 and any new gate requirements as cross-cutting refs).

## Phase 4 — Enforcement in flow
1. Update `.ai/pre-commit.json`
   - include `npm run gate:all` for Wave 2+ branches (or staged command list with fail-fast).
2. `gate:all` must explicitly execute Tier 1..4 checks and fail on any missing tier.
3. Keep `.ai/pre-push.json` disabled for now (Milestone 6), but add TODO block with planned push enforcement.
4. Write gate report artifact on every run using spec-required deterministic name:
   - `.ai/log/plan/verification-gates-report-<wave>.json`
5. Enforce hard-fail semantics in orchestrator: any G1–G9 fail => merge block.

## Phase 5 — Rollout strategy
1. Wave 2 soft-enforce mode:
   - gates run and report, failures block unless explicitly overridden by Spencer
2. Wave 3 hard-enforce mode:
   - all failures block by default
3. After 2 stable waves:
   - raise global line coverage floor from 70 -> 80

## Risks
1. Changed-lines coverage implementation complexity (source maps / TS+JS duplicates).
2. Mutation-lite flakiness if probes are too broad.
3. Overly strict heuristics may block productive changes initially.

## Mitigations
1. Start with deterministic file-level probes and tighten later.
2. Keep mutation-lite probes targeted to 1–2 critical modules.
3. Provide explicit waiver path recorded in gate report.

## Acceptance criteria
1. `npm run gate:all` fails when any G1–G9 condition fails.
2. Coverage checks enforce global/changed-line/critical-branch thresholds.
3. VQ lens review artifact exists under `.ai/log/review/` with proof fields.
4. Traceability check fails on unmapped touched requirements.
5. Gate report artifact generated per wave.
