# Spec: Linked Content Ingestion (Phase B)

## Goal
Enable explicit, per-link user-confirmed ingestion of links found in user messages, reusing shared ingestion core routing semantics and preserving fail-open behavior.

## Scope
- In scope:
  - detect HTTP/HTTPS links in user messages
  - require per-link explicit user confirmation before ingest
  - ingest approved links via shared ingestion core
  - support PDFs, common text files, and HTML readable-text extraction
- Out of scope:
  - autonomous external discovery (feature 1c)
  - non-http(s) schemes
  - JavaScript-rendered browser automation for extraction

## Requirements

### PM15-R1 — Explicit confirmation model (per-link)
1. The system MUST require explicit user approval before ingesting any detected link.
2. Approval granularity MUST be per-link (not batch-only).
3. Unapproved links MUST NOT be ingested.

### PM15-R2 — Explicit ingestion action
1. Plugin MUST expose an explicit ingestion action for approved links (e.g., `bonfires_ingest_link` tool surface).
2. Per-link confirmation is enforced by orchestration/chat-layer policy; tool invocation is treated as already user-approved input.
3. The explicit ingestion action MUST invoke shared ingestion core logic used by cron routing where applicable.
4. The action MUST return per-link status with route/result details.

### PM15-R3 — Link classification + route selection
1. Approved links MUST be classified by content type/extension.
2. Route rules:
   - PDF (`application/pdf` or `.pdf`) -> `/ingest_pdf`
   - text-like files (`text/*`, `.md`, `.txt`, `.json`, `.yaml`, `.csv`, etc.) -> `/ingest_content`
   - HTML (`text/html`) -> readable-text extraction then `/ingest_content`
3. Unsupported types SHOULD return explicit non-fatal skip/error reason.

### PM15-R4 — HTML extraction behavior
1. HTML ingestion MUST extract primary readable content (Readability-style extraction) before ingest.
2. Extraction MUST be deterministic and testable (no opaque LLM summarization in extraction path).
3. Fallback behavior SHOULD produce safe plain-text extraction when primary extraction fails, or fail explicitly with reason.

### PM15-R5 — Transport safety guards
1. Only `http`/`https` URLs are allowed.
2. Requests MUST enforce SSRF-style protections (block localhost/private-network targets and disallowed redirect targets).
3. Redirect handling MUST be deterministically enforced at the application layer for policy bounds (not runtime-default redirect behavior alone).
4. Enforce configurable bounds: timeout, max redirects, max response bytes/chars.
5. Failures in one link MUST NOT abort processing for other approved links.

### PM15-R6 — Provenance + observability
1. Ingested linked content MUST include provenance metadata where endpoint supports metadata (e.g., `source_url`, `fetched_at`, `content_type`, `origin=linked_content`).
2. For `/ingest_pdf` where metadata fields are not currently supported, logs/results MUST still include source URL and route.
3. Per-link result payload MUST include: URL, classification, route, success/failure, and duplicate/no-op signal when returned.

### PM15-R7 — Idempotency semantics
1. Duplicate outcomes reported by Bonfires MUST be treated as successful no-op.
2. Duplicate detection MUST be tolerant to message variants (for example `duplicate`, `duplicate content`, or equivalent duplicate-indicating strings), not exact-string-only matching.
3. PM15 MUST preserve PM14/PM4 dedupe semantics and not regress cron behavior.

## Acceptance
- Assistant requests per-link confirmation before ingesting detected links.
- Confirmed PDF links ingest through `/ingest_pdf`.
- Confirmed HTML links ingest through readable extraction + `/ingest_content`.
- Confirmed text-file links ingest via `/ingest_content`.
- One link failure does not prevent others from processing.
- Duplicate responses are reported as successful no-op outcomes.
