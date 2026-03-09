# Correctness Review — PM16/PM17 implementation rerun (2026-03-08)

- tz_id: `tz:reviewer:bonfires-plugin`
- project_slug: `bonfires-plugin`
- review_lens: `Correctness`
- verdict: `GO`
- confidence: high

## Scope reviewed
- Invocation envelope: `.ai/log/review/reviewer-envelope-pm16-pm17-correctness-implementation-20260308.json`
- Delta diff: `.ai/log/review/delta-pm16-pm17-implementation-rerun-20260308.patch`
- Focus problems:
  - `problem:bonfires-plugin:verify-pm16-approval-gated-multi-link-ingestion`
  - `problem:bonfires-plugin:verify-pm17-discovery-selected-set-approval`
  - `problem:bonfires-plugin:verify-spec-guidance-traceability-coherence`

## Artifacts reviewed
- `src/config.ts`
- `src/hooks.ts`
- `src/index.ts`
- `src/tools/bonfires-ingest-links.ts`
- `src/tools/discover-links.ts`
- `src/tools/bonfires-ingest-link.ts`
- `src/transport-safety.ts`
- `tests/wave14-pm16-pm17.test.ts`
- `tests/wave12-pm15.test.ts`
- `.ai/spec/spec/ingestion/approval-gated-link-ingestion-and-discovery.md`
- `.ai/spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`
- `.ai/spec/spec/requirements-index.md`
- `.ai/spec/spec/quality/traceability-map.json`

## Required checks

1. Approval-only execution set enforcement — **pass**
2. Discovery feature-flag-off default — **pass**
3. Lightweight `before_agent_start` behavior — **pass**
4. PM15 transport-safety reuse — **pass**
5. Non-breaking legacy behavior — **pass**

## Evidence and reasoning over `delta.git_diff`

### 1. Approval-only execution set enforcement — pass
The diff correctly hardens both contract and runtime so the only executable ingest set is `approvalContext.approvedUrls`.

Evidence:
- Spec/guidance now explicitly state that execution must use only the approved set and must not accept a broader candidate/requested URL list:
  - `.ai/spec/spec/ingestion/approval-gated-link-ingestion-and-discovery.md`
  - `.ai/spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`
- Tool schema in `src/index.ts` removes any independent executable `urls` input and requires:
  - `approvalContext.approvedByUser === true`
  - non-empty `approvalContext.approvedUrls`
- Runtime in `src/tools/bonfires-ingest-links.ts` fail-closes if:
  - `approvalContext` is missing/malformed
  - `approvedByUser !== true`
  - `approvedUrls` is empty
  - a separate `urls` field is supplied
- Execution iterates only over `validated.approvedUrls`, so no unapproved candidate can enter ingestion.
- End-to-end coverage exists in `tests/wave14-pm16-pm17.test.ts`, including the selected-subset-only path.

This satisfies the approval-bound execution requirement.

### 2. Discovery feature-flag-off default — pass
The diff correctly keeps discovery disabled by default.

Evidence:
- `src/config.ts` sets `const discoveryEnabled = Boolean(cfg.discovery?.enabled ?? false);`
- `src/tools/discover-links.ts` checks `deps.cfg?.discovery?.enabled === true` and otherwise returns:
  - `success: false`
  - `error: 'discover_links is disabled by feature flag'`
- Docs and requirements index align with the implementation:
  - `.ai/spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`
  - `.ai/spec/spec/requirements-index.md`
- Test coverage confirms default-off behavior:
  - `PM17: discover_links is disabled by default feature flag`

This correctly enforces PM17’s disabled-by-default rollout posture.

### 3. Lightweight `before_agent_start` behavior — pass
The implementation preserves the lightweight hook boundary.

Evidence:
- `src/hooks.ts` only:
  - extracts user message
  - detects URLs locally with regex
  - performs the pre-existing Bonfires search call
  - injects compact system guidance when links are present
- It does **not** perform discovery fetches, content fetches, or ingestion in `before_agent_start`.
- Link handling at hook time is guidance-only:
  - “do not ingest them into Bonfires without explicit user approval”
- The hook returns prompt additions only (`prependContext`, `prependSystemContext`) and degrades fail-open on errors.
- Test coverage explicitly asserts the hook remains lightweight and only performs the existing search call:
  - `PM16: before_agent_start injects lightweight approval guidance when links are present`

This matches the non-blocking hook requirement.

### 4. PM15 transport-safety reuse — pass
PM16 correctly reuses the PM15 ingestion/transport-safety path rather than introducing a parallel unsafe fetch path.

Evidence:
- `src/tools/bonfires-ingest-links.ts` delegates each approved URL to `ingestLink(...)` from `src/tools/bonfires-ingest-link.ts`
- `ingestLink(...)` reuses:
  - `validateFetchUrl(...)`
  - `safeFetch(...)`
  from `src/transport-safety.ts`
- Therefore PM16 inherits PM15 protections for:
  - allowed schemes only
  - localhost/private-host blocking
  - redirect re-validation
  - response-size / timeout guards
- Partial-failure accounting in PM16 correctly maps blocked transport-safety failures into the batch summary without bypassing PM15 behavior.
- Existing PM15 tests remain aligned with this reused path.

This satisfies the reuse-first / transport-safety requirement.

### 5. Non-breaking legacy behavior — pass
The delta preserves existing legacy tooling and baseline behavior.

Evidence:
- Legacy `bonfires_ingest_link` remains registered unchanged in `src/index.ts`
- Existing search and stack-search tools remain registered
- Older tests that previously assumed exactly 3 tools were correctly relaxed to `>= 3`:
  - `tests/wave1.test.ts`
  - `tests/wave9-pm12.test.ts`
  - `tests/wave12-pm15.test.ts`
- Default behavior remains safe for installations not opting into discovery:
  - discovery disabled unless explicitly enabled
- `before_agent_start` still performs the original Bonfires search path; the new behavior is additive guidance injection, not a semantic replacement of prior context lookup.

No correctness regression to PM15/legacy behavior was found within the reviewed scope.

## Findings
No correctness blockers found in the reviewed PM16/PM17 implementation delta.

## Final decision
`GO`
