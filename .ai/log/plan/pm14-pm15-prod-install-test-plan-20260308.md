# PM14/PM15 Production Install + Test Plan (2026-03-08)

## Objective
Validate PM14 (PDF routing) and PM15 (linked-content ingestion safety/UX) in production before PM16/PM17 implementation.

## Scope
- In scope: plugin deployment refresh, gateway restart, runtime smoke checks, PM14/PM15 behavior verification.
- Out of scope: PM16/PM17 implementation changes.

## Preconditions
1. bonfires-plugin changes committed (done).
2. Bonfires credentials configured in runtime env (`DELVE_API_KEY`, `BONFIRE_ID` path via config).
3. OpenClaw plugin entry remains enabled in `openclaw.json`.

## Install/activation sequence
1. Confirm plugin path install:
   - `openclaw plugins install -l /home/lyle/.openclaw/workspace/projects/bonfires-plugin`
2. Clear jiti cache (required for TS source refresh):
   - `rm -rf /tmp/jiti/*`
3. Restart gateway:
   - `/opt/tools/bin/restart-gateway`
4. Verify plugin health:
   - `openclaw plugins doctor`

## Verification matrix

### A. Baseline runtime
1. `openclaw status` succeeds.
2. `openclaw plugins doctor` reports `bonfires-plugin` loaded.
3. No boot-time plugin exceptions in gateway logs.

### B. PM14 checks (PDF routing)
1. Add a small test `.pdf` file in an ingested profile path.
2. Trigger ingestion run (`npm run ingest:bonfires` for controlled run or wait cron tick).
3. Verify summary artifact shows PDF routed to `/ingest_pdf` path (success or duplicate).
4. Confirm non-PDF files still route to `/ingest_content` unchanged.

### C. PM15 checks (link ingestion)
1. Tool availability: `bonfires_ingest_link` exposed in runtime.
2. Safe URL pass case (public https text/html/PDF URL): success or duplicate.
3. SSRF block case (localhost/private IP URL): blocked with explicit error.
4. Redirect safety case: redirect to private host is blocked.
5. Duplicate semantics: duplicate returns success/no-op, not failure.

### D. Non-regression checks
1. `bonfires_search` still works.
2. `bonfires_stack_search` still works.
3. `before_agent_start` remains responsive (no heavy blocking behavior introduced).

## Evidence artifacts
- `.ai/log/plan/pm14-pm15-prod-validation-20260308.md` (runbook + outcomes)
- `.ai/log/plan/verification-gates-report-current.json` (if gate run invoked)
- ingestion summary files under configured state dir

## Go/No-Go criteria
- GO if A/B/C/D all pass (or known benign duplicates where applicable).
- NO_GO on any safety regression (SSRF bypass, unsafe redirect acceptance, blocking hook path).
- CONDITIONAL_GO only for non-safety issues with bounded mitigation and explicit follow-up.
