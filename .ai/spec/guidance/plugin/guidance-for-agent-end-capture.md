# Guidance: agent_end Capture (Reviewer Quality Criteria)

Reviewers should verify:
- State-management quality: watermark updates only after successful capture.
- Idempotency quality: no duplicate push for same message range.
- Throttle quality: enforced per-session window behavior.
- Degradation quality: missing `sessionKey` or unknown mapping remains non-fatal.
- Boundary quality: capture logic remains behind ledger/client abstractions (low coupling).
