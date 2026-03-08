# Guidance: PDF Ingestion Routing (PM14)

Reviewer/implementer guidance for adding a PDF lane to ingestion with minimal architecture change.

## Design intent
- Keep plugin thin: discovery/routing/policy in plugin; extraction/chunking delegated to Bonfires `/ingest_pdf`.
- Preserve existing ingestion cron/profile model and current text path behavior.
- Routing should be implemented in shared ingestion core so non-cron triggers (e.g., approved-link ingestion) can reuse exactly the same routing semantics.
- Maintain fail-open execution and per-file isolation.

## Implementation guidance
1. Add a hosted client method (e.g., `ingestPdf`) that:
   - builds `POST /ingest_pdf?bonfire_id=...`
   - sends multipart `file` payload
   - returns normalized `DocumentResponse` projection used by ingestion summaries.
2. In ingestion runner, apply deterministic extension routing:
   - `.pdf` (case-insensitive) -> `ingestPdf`
   - else -> existing text path.
3. Keep symlink skip and glob filtering unchanged.
4. Do not introduce local PDF extraction/chunking in PM14.

## Verification checklist
- Route correctness:
  - PDFs route to `/ingest_pdf`
  - text files still route to `/ingest_content`
- Failure isolation:
  - one PDF ingest failure does not abort run
- Dedupe behavior:
  - duplicate PDF response treated as successful no-op
- Config stability:
  - no new required keys; `.pdf` in `extensions` is sufficient
- Observability:
  - summaries/logs include route + per-file outcome

## Suggested tests
1. Unit test: extension router chooses PDF lane for `.pdf` and `.PDF`.
2. Unit test: PDF client request shape (`bonfire_id` query + multipart `file`).
3. Integration/mock test: mixed file set (`.md`, `.txt`, `.pdf`) routes correctly in one run.
4. Error-path test: PDF upload failure increments error count and continues.
5. Dedupe-path test: PDF response message `duplicate` counted as non-failure.
