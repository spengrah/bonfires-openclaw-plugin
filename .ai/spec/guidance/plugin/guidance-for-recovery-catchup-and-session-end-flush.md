# Guidance: Recovery + Session-end Flush (Reviewer Quality Criteria)

Reviewers should verify:
- Recovery correctness: only uncaptured ranges are backfilled.
- Shared-state integrity: recovery and primary capture use one consistent ledger model.
- Close-detection quality: session-end hook path and fallback policy are deterministic.
- Duplication safety: overlapping observers do not re-push identical ranges.
