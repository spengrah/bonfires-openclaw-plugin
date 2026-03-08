# Review — Correctness (Wave 9 PM14/PM15)

- tz_id: `tz:reviewer:bonfires-plugin`
- lens: `Correctness`
- delta: `.ai/log/review/diff-wave-9-pm14-pm15-929ffec.patch`
- commit range: `b22518a..929ffec`

## Findings
1. PM14 routing behavior appears correctly implemented via shared core (`ingestion-core.ts`) and integrated in cron ingestion path.
2. PM14 duplicate handling is implemented in ingestion path and exercised by tests.
3. **Blocking issue:** PM15 PDF ingest result handling in `src/tools/bonfires-ingest-link.ts` treats PDF ingest as success regardless of returned `result.success`.
   - Current behavior returns `{ success: true }` whenever `client.ingestPdf(...)` resolves, even if payload contains `success: false`.
   - This can silently misreport failures as successful ingest.

## Required-before-merge
1. Respect `result.success` for PM15 PDF lane and propagate non-success as failure with reason.
2. Add a regression test where `ingestPdf` resolves with `success:false` and ensure tool returns failure.

## Verdict
`NO_GO`

Rationale: correctness violation in PM15 result semantics is merge-blocking.
