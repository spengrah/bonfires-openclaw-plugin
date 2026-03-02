# Spec: agent_end Episodic Capture

## Goal
Persist episodic conversation slices to Bonfires after turns.

## Requirements
1. Hook runs after each turn (`agent_end`) for all sessions.
2. Capture watermark tracked per `ctx.sessionKey` (`lastPushedAt`, `lastPushedIndex`).
3. Within throttle window (default 15m), skip push.
4. Outside window, push only new message slice since `lastPushedIndex`.
5. Update watermark only on successful push.
6. Wave 1 ledger must implement an interface (`CaptureLedger`) that Wave 3 can replace with a persisted implementation without changing hook code:
   - `get(sessionKey: string): Watermark | undefined`
   - `set(sessionKey: string, watermark: Watermark): void`
   - `Watermark = { lastPushedAt: number; lastPushedIndex: number }`

## Acceptance
- Back-to-back calls in same window cause one push.
- New slice push resumes correctly after window expiry.
