# Verification Quality Review — PM16/PM17 implementation rerun (2026-03-08)

- tz_id: `tz:reviewer:bonfires-plugin`
- project_slug: `bonfires-plugin`
- review_lens: `Verification Quality`
- verdict: `GO`
- confidence: high

## Scope reviewed
- Invocation envelope: `.ai/log/review/reviewer-envelope-pm16-pm17-verification-quality-implementation-rerun-20260308.json`
- Delta diff: `.ai/log/review/delta-pm16-pm17-implementation-rerun-20260308.patch`
- Primary implementation artifacts:
  - `src/tools/bonfires-ingest-links.ts`
  - `src/tools/discover-links.ts`
  - `src/index.ts`
  - `src/config.ts`
  - `src/hooks.ts`
- Primary verification artifacts:
  - `tests/wave14-pm16-pm17.test.ts`
  - `tests/REQUIREMENT-MAPPING.md`
  - `.ai/spec/spec/ingestion/approval-gated-link-ingestion-and-discovery.md`
  - `.ai/spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`
  - `.ai/spec/spec/requirements-index.md`
  - `.ai/spec/spec/quality/traceability-map.json`

## Required checks
1. Exact selected-set approval handoff — **pass**
2. Fail-closed malformed approval coverage with zero ingestion side effects — **pass**
3. Execution-path `maxUrlsPerRun` enforcement — **pass**
4. Explicit PM16/PM17 registration/schema regression coverage — **pass**

## Evidence and reasoning over delta.git_diff

### 1. Exact selected-set approval handoff — pass
The diff tightens both contract text and executable behavior:
- Spec/guidance now state that `approvalContext.approvedUrls` is the only executable ingest set and that no broader candidate/requested list may accompany execution:
  - `.ai/spec/spec/ingestion/approval-gated-link-ingestion-and-discovery.md`
  - `.ai/spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`
- Runtime rejects any independent `urls` field and only executes `validated.approvedUrls`:
  - `src/tools/bonfires-ingest-links.ts`
- End-to-end regression coverage exists and is specific:
  - `tests/wave14-pm16-pm17.test.ts`
  - test: `PM17: discovery-selected approval subset is the exact and only executable ingest set end-to-end`

This closes the prior VQ blocker: the selected approved subset is now both contractually and executably the sole ingest set.

### 2. Fail-closed malformed approval coverage with zero ingestion side effects — pass
The diff adds explicit validation and negative-path tests:
- `validateApprovalContext(...)` rejects missing, false, empty, and oversized approval contexts:
  - `src/tools/bonfires-ingest-links.ts`
- `bonfiresIngestLinksTool(...)` returns failure before any ingestion attempt on malformed approval or bypass-style payloads:
  - `src/tools/bonfires-ingest-links.ts`
- Regression test verifies zero side effects on malformed cases and bypass attempt by asserting no `ingestContent`/`ingestPdf` calls:
  - `tests/wave14-pm16-pm17.test.ts`
  - test: `PM16: bonfires_ingest_links rejects malformed or inconsistent approval payloads fail-closed with zero ingestion side effects`

This closes the prior blocker. The coverage is direct, negative-path, and side-effect aware.

### 3. Execution-path maxUrlsPerRun enforcement — pass
The diff adds config parsing and runtime enforcement:
- Config accepts and bounds `ingestion.approval.maxUrlsPerRun`:
  - `src/config.ts`
- Runtime passes configured limit into `validateApprovalContext(...)` and rejects oversized approved sets before execution:
  - `src/tools/bonfires-ingest-links.ts`
- Regression test exercises the execution path, not just schema/docs:
  - `tests/wave14-pm16-pm17.test.ts`
  - test: `PM16: bonfires_ingest_links enforces ingestion.approval.maxUrlsPerRun through execution path`

This closes the prior blocker.

### 4. Explicit PM16/PM17 registration/schema regression coverage — pass
The diff adds both implementation and regression checks:
- Tool registrations are present in `src/index.ts` for:
  - `bonfires_ingest_links`
  - `discover_links`
- Tool parameter schemas are explicit in `src/index.ts`:
  - `bonfires_ingest_links` requires `approvalContext`, forbids extra properties, and constrains `approvedUrls`
  - `discover_links` requires `query`, bounds `maxCandidates`, forbids extra properties
- Regression coverage asserts exact tool surface and schema characteristics:
  - `tests/wave14-pm16-pm17.test.ts`
  - test: `PM16/PM17: plugin registers the explicit PM16/PM17 tool surface and schemas`
- Traceability artifacts were updated to include PM16/PM17:
  - `.ai/spec/spec/requirements-index.md`
  - `.ai/spec/spec/quality/traceability-map.json`
  - `tests/REQUIREMENT-MAPPING.md`

This closes the prior blocker.

## Additional verification note
Targeted test run passed:
- Command: `npm test -- --run tests/wave14-pm16-pm17.test.ts`
- Result: pass (suite completed successfully; PM16/PM17 targeted tests passed)

## Findings
No Verification Quality blockers found within the requested scope.

## Final decision
`GO`
