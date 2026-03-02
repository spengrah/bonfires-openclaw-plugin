# Guidance: Recovery + Session-end Flush (Reviewer Quality Criteria)

Reviewers should verify:
- Recovery correctness: only uncaptured ranges are backfilled.
- Shared-state integrity: recovery and primary capture use one consistent ledger model.
- Close-detection quality: session-end hook path and fallback policy use the single canonical timeout formula (`2 * capture.throttleMinutes`).
- Dedupe quality: explicit dedupe key (`sessionKey:startIndex-endIndex`) is used for overlap prevention.
- Overlap safety: ranges with `endIndex <= lastPushedIndex` are never re-pushed; larger overlapping ranges resolve deterministically.
