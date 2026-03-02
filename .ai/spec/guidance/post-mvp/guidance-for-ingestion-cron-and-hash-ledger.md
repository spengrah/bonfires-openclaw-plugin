# Guidance: Ingestion Cron + Hash Ledger (Reviewer Quality Criteria)

Reviewers should verify:
- Idempotency quality: canonicalization + hashing policy prevents duplicate ingest.
- Persistence quality: ledger survives restart and supports deterministic replay checks.
- Modularity quality: source adapters are separated from dedupe/ledger core.
- Operability quality: run summaries expose ingested/skipped/error counts.
