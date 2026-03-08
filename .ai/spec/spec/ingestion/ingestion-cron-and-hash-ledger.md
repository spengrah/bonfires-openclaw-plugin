# Spec: Ingestion Cron + Hash Ledger

## Goal
Support deferred bulk/content ingestion with idempotency and replay safety.

## Requirements
1. Scheduled ingestion runner scans configured sources on cadence.
2. Hash ledger records content fingerprints to avoid duplicate ingest.
3. New/changed content routes to ingest endpoints only once per content revision.
4. Ledger supports recovery after restart (persisted state).
5. Runner emits summary artifacts (ingested/skipped/error counts).

## Acceptance
- Unchanged content is skipped deterministically.
- Changed content is ingested exactly once per new hash.
- Restart does not cause duplicate ingestion of previously seen hashes.
