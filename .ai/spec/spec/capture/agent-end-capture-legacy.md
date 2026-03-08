> **Superseded by PM10** (`immediate-stack-capture.md`).
> The throttled capture model described here has been replaced by immediate per-turn capture.
> This file is retained for historical reference only.

# Spec: agent_end Episodic Capture (Legacy)

## Goal
Persist episodic conversation slices to Bonfires after turns.

## Requirements (historical — replaced by PM10)
1. Hook runs after each turn (`agent_end`) for all sessions.
2. Capture watermark tracked per `ctx.sessionKey` (`lastPushedAt`, `lastPushedIndex`).
3. ~~Within throttle window (default 15m), skip push.~~ **Removed in PM10 — capture is now immediate.**
4. Push only new message slice since `lastPushedIndex`.
5. Update watermark only on successful push.
6. Ledger implements `CaptureLedger` interface:
   - `get(sessionKey: string): Watermark | undefined`
   - `set(sessionKey: string, watermark: Watermark): void`
   - `Watermark = { lastPushedAt: number; lastPushedIndex: number }`
