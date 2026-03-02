# Verification Matrix — Wave 6 (20260302w6a)

| Requirement | Command | Pass threshold | Artifact |
|---|---|---|---|
| Idempotent hash-dedupe ingestion | `npm run test` | `wave6` ingestion tests pass | `tests/wave6-ingestion.test.ts` |
| Persisted ledger restart safety | `npm run test` | second run skips unchanged content | `src/ingestion.ts` + tests |
| Summary artifact shape | `npm run test` + `npm run ingest:bonfires` | summary file exists with counters | `.ai/log/plan/ingestion-cron-summary-current.json` |
| Ingest endpoint wiring | `npm run test` | hosted ingest payload mapping test passes | `tests/wave2-hosted.test.ts` |
| Generic agent mapping (no personal name requirement) | `npm run test` | config/mapping tests pass with generic IDs | `src/config.ts`, `tests/wave1.test.ts`, spec/guidance docs |
| Full deterministic suite | `npm run gate:all` | PASS | `scripts/gates/gate-all.ts` |
