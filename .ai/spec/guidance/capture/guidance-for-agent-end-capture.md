# Guidance: agent_end Capture (Reviewer Quality Criteria)

Reviewers should verify:
- State-management quality: watermark updates only after successful capture.
- Idempotency quality: no duplicate push for same message range.
- Immediate capture: every `agent_end` pushes new messages with no throttle window (PM10).
- Degradation quality: missing `sessionKey` or unknown mapping remains non-fatal.
- Boundary quality: capture logic remains behind ledger/client abstractions (low coupling).
- Display names: assistant messages use `agentDisplayName` for userId/username (PM13).
