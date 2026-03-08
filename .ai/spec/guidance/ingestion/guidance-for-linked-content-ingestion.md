# Guidance: Linked Content Ingestion (PM15)

Reviewer/implementer guidance for explicit, user-approved link ingestion.

## Design intent
- Keep control explicit: detect links, ask, ingest only approved links.
- Confirmation boundary: orchestration/chat layer handles per-link user approval; `bonfires_ingest_link` executes only approved links.
- Use one shared ingestion core for routing semantics across cron + link ingestion.
- Support high-value types first: PDF, text-like files, HTML readable extraction.

## Suggested flow
1. Detect link candidates from user message.
2. Present candidates and request per-link confirmation.
3. On confirmation, call explicit ingestion action (`bonfires_ingest_link`).
4. For each approved link:
   - fetch with transport safety guards
   - classify type
   - route:
     - PDF -> `/ingest_pdf`
     - text/html extracted text -> `/ingest_content`
5. Return per-link results with success/error/duplicate status.

## HTML extraction guidance
- Preferred: reuse deterministic Readability-style extraction logic equivalent to `web_fetch` behavior when feasible.
- If direct reuse is not practical, implement deterministic in-plugin extraction (`jsdom` + `@mozilla/readability`, optional markdown conversion) with tests.
- Avoid JS-executing/browser dependency in PM15 extraction path.

## Safety guidance
- Allow only `http(s)`.
- Enforce SSRF protections on initial URL and redirects.
- Enforce timeout/max-bytes/max-chars/max-redirects.
- Implement redirect-count bounds deterministically at application layer (for example, `redirect: 'manual'` + explicit follow loop) rather than relying on runtime default follow limits.
- Re-validate each redirect hop target before requesting it.
- Do not log secrets; limit logging to operational metadata.

## Verification checklist
- Confirmation:
  - no ingestion before explicit per-link approval
  - partial approvals behave correctly
- Routing:
  - PDF -> `/ingest_pdf`
  - HTML -> extract + `/ingest_content`
  - text files -> `/ingest_content`
- Resilience:
  - one link failure does not abort others
- Idempotency:
  - duplicate response treated as success/no-op
  - duplicate-message variant matching is covered (not exact-string-only)
- Redirect policy:
  - deterministic app-layer redirect-hop limit is enforced and tested
- Provenance:
  - source URL is included in result metadata/logs

## Suggested tests
1. Detection + confirmation state machine tests (per-link decisions).
2. Transport guard tests (scheme validation, localhost/private-net blocking, redirect blocking, deterministic redirect-hop limit).
3. Routing tests by type (pdf/html/txt/json).
4. HTML extraction quality smoke tests on representative pages.
5. Mixed-result test: one success, one duplicate, one failure in same request.
6. Duplicate-message variant tests (`duplicate`, `duplicate content`, etc.).
