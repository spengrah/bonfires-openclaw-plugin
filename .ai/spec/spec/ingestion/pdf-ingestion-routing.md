# Spec: PDF Ingestion Routing (Phase A)

## Goal
Extend ingestion routing to support PDF sources by routing `.pdf` content to Bonfires `POST /ingest_pdf`, while preserving current text-ingestion behavior and fail-open runtime safety.

## Scope
- In scope: workspace/profile file discovery + endpoint routing for `.pdf` files.
- Architectural intent: routing behavior is source-trigger agnostic and should live in shared ingestion core logic reusable by cron and future link-ingestion triggers.
- Out of scope: DOCX/other binary formats, URL-linked ingestion, local PDF extraction/chunking, taxonomy metadata attachment at ingest time.

## Requirements

### PM14-R1 — Profile compatibility (no new config keys)
1. Existing ingestion profile schema remains authoritative (`rootDir`, `includeGlobs`, `excludeGlobs`, `extensions`, `agentProfiles`, `defaultProfile`).
2. PDF ingestion is activated by including `.pdf` in profile `extensions`.
3. No new required plugin config keys are introduced for PM14.

### PM14-R2 — Deterministic extension-based routing
1. Ingestion runner MUST route files with extension `.pdf` (case-insensitive) to `ingestPdf(...)` client path.
2. Non-PDF files MUST continue using existing text ingestion route (`ingestContent(...)`) and existing behavior.
3. Routing decision MUST be deterministic and based on normalized extension.

### PM14-R3 — Bonfires `/ingest_pdf` contract
1. Hosted client MUST call `POST /ingest_pdf` with:
   - required query param `bonfire_id`
   - multipart form field `file` containing the PDF bytes.
2. Client MUST preserve existing auth behavior (`Authorization: Bearer` with legacy fallback as currently implemented).
3. Client MUST normalize response for ingestion summaries using `DocumentResponse` fields (`success`, `bonfire_id`, `document_id`, `message`).

### PM14-R4 — Fail-open and per-file fault isolation
1. Failure to ingest one PDF MUST NOT abort the entire ingestion run.
2. Runner MUST continue with remaining files and report per-file errors.
3. No local fallback parsing/chunking for PDFs is attempted in PM14.

### PM14-R5 — Idempotency and dedupe semantics
1. PM4 hash-ledger behavior remains unchanged for non-PDF/text path.
2. For PDF path, Bonfires response is source of truth for dedupe signals (e.g., `message: "duplicate"`).
3. Repeated ingestion attempts across cron cycles are allowed and must be treated as successful no-op when Bonfires reports duplicate.

### PM14-R6 — Safety invariants
1. Existing traversal safety remains in effect (include/exclude globs, symlink skip behavior, profile root constraints).
2. Secrets must never be logged.
3. Hook/cron behavior remains fail-open (no host flow crash on ingest errors).

### PM14-R7 — Operability and observability
1. Ingestion summary MUST include route-level outcomes for PDF lane (`ingest_pdf`) vs text lane (`ingest_content`).
2. Per-file logs SHOULD include `source_path`, route, and normalized Bonfires result fields.
3. Errors SHOULD include enough context for debugging (profile + path + route + status/message).

## Acceptance
- When a profile includes `.pdf`, discovered PDFs are uploaded through `/ingest_pdf` and return success/duplicate outcomes without breaking text ingestion.
- A failed PDF upload does not stop ingestion of other files.
- Existing non-PDF ingestion behavior remains unchanged.
- No new required config keys are needed to enable PDF support beyond listing `.pdf` in profile extensions.
