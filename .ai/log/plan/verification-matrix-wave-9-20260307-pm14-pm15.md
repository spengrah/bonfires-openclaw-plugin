# Verification Matrix — Wave 9 (PM14/PM15 plan-phase)

## PM14 — PDF ingestion routing

| Requirement | Planned check | Pass condition |
|---|---|---|
| PM14-R1 profile compatibility | Config/normalization tests | No new required keys; `.pdf` in `extensions` enables PDF lane |
| PM14-R2 extension routing | Unit tests for router | `.pdf` and `.PDF` route to PDF lane; non-PDF unchanged |
| PM14-R3 `/ingest_pdf` contract | Client request-shape tests + live/manual smoke | Query `bonfire_id` + multipart `file` used; response normalized |
| PM14-R4 fail-open isolation | Ingestion run tests with forced PDF error | Failed PDF does not abort run; remaining files continue |
| PM14-R5 idempotency semantics | Duplicate replay tests/manual | Duplicate response treated as successful no-op |
| PM14-R6 safety invariants | Traversal/security regression tests | Symlink skip + root/glob constraints unchanged |
| PM14-R7 observability | Log/summary assertions | Per-file route and result fields emitted |

## PM15 — Linked content ingestion

| Requirement | Planned check | Pass condition |
|---|---|---|
| PM15-R1 per-link explicit confirmation | Tool/flow state tests | No link ingested before explicit per-link approval |
| PM15-R2 explicit ingestion action + shared core | Integration tests (tool + core) | Tool invokes shared core; returns per-link status |
| PM15-R3 route selection by type | Type-classification tests | PDF->`/ingest_pdf`; text/html->`/ingest_content` path |
| PM15-R4 deterministic HTML extraction | Extractor tests on fixed fixtures | Stable extraction output within bounded variance |
| PM15-R5 transport safety guards | Security tests (scheme/redirect/private targets) | Non-http(s), localhost/private-net, bad redirects blocked |
| PM15-R6 provenance + observability | Result payload tests | URL/classification/route/outcome included per link |
| PM15-R7 idempotency semantics | Duplicate outcome tests | duplicate returned as success/no-op, not failure |

## Gates to run at implementation checkpoints
1. `npm run -s lint`
2. `npm run -s test`
3. `npm run -s gate:traceability`
4. `npm run -s gate:all` (subject to known environment ownership issues being resolved)
