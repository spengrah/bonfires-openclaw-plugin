# Spec: Recovery Catch-up + Session-end Flush (MVP)

## Goal
Guarantee eventual capture when normal hook flow misses data.

## Requirements
1. Heartbeat path scans persisted session transcripts and recovers uncaptured slices.
2. Recovery and `agent_end` share one persisted watermark ledger.
3. Recovery must be idempotent (no duplicate re-push of same range).
4. Session-end flush policy:
   - Use `session_end` hook if available.
   - Else emulate close via inactivity timeout: a session with no `agent_end` fire for 2x `capture.throttleMinutes` (default 30 min) is considered closed. Flush on next heartbeat tick after threshold is exceeded.
5. Ledger updates must avoid stale overwrite between recovery and `agent_end`; write path uses a single in-process ledger owner and read-modify-write from latest in-memory state.

## Acceptance
- Simulated missed `agent_end` events are recovered.
- Duplicate prevention verified when both paths observe same range.
- Final session slice is captured on close condition.
