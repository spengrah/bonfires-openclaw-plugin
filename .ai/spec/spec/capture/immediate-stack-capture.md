# Spec: Immediate Stack Capture (Architecture Simplification)

**ID:** PM10
**Status:** Draft — replaces throttled capture model from PM1/PM7/PM8
**Supersedes:** PM1 (throttled agent_end capture), PM7 (compaction flush), PM8 (watermark reset on truncation)
**Preserves:** PM9 (prependContext stripping), extractUserMessage(), paired message logic, heartbeat processStack

## Problem

The current capture architecture throttles `stack/add` calls to once per 15-minute window. This creates a "capture debt" — messages that exist in the OpenClaw transcript but haven't been pushed to the Bonfires stack. Three mechanisms can destroy those unpushed messages before the debt is paid:

1. **Context compaction** (safeguard mode) — rewrites transcript when context window fills
2. **Context pruning** (cache-ttl, 3d) — drops messages older than TTL
3. **Session idle reset** (30min) — resets session after inactivity

PM7 and PM8 attempted to patch this with compaction flush and watermark reset guards, but:
- `before_compaction` receives an empty `event.messages` array (discovered in production testing)
- Context pruning and idle reset may not fire any hook at all (unknown)
- The patches add complexity without eliminating the fundamental data loss window

## Insight

The Bonfires API separates message ingestion from episode extraction:
- `POST /agents/{id}/stack/add` — lightweight, just queues messages on the stack
- `GET /agents/{id}/stack/process` — heavyweight, extracts episodes from queued messages

The current plugin conflates these two operations behind a single throttle. The Bonfires-recommended pattern (per their API docs) is:
- Call `stack/add` frequently (every turn)
- Call `stack/process` on a periodic heartbeat (every 15-20 minutes)

## Design

### Principle
Push messages to the Bonfires stack immediately on every `agent_end`. Defer episode extraction to the heartbeat. Messages are safe off-box the moment the agent finishes responding.

### agent_end hook
1. Resolve Bonfires agent ID. Return early if unmapped.
2. Get watermark for `ctx.sessionKey`. Compute slice start = `lastPushedIndex + 1` (or 0 if no watermark).
3. **No time-based throttle.** Always push if there are new messages.
4. Watermark reset guard (retained from PM8): if `lastPushedIndex >= msgs.length`, log warning, reset start to 0.
5. Call `client.capture()` with the new message slice (stack/add with paired messages).
6. On success, update watermark to `{lastPushedAt: now, lastPushedIndex: msgs.length - 1}`.
7. Do **not** call `processStack` here.

### session_end hook
1. Resolve agent, get messages. Return early if empty or unmapped.
2. Push any uncaptured messages (same watermark logic as agent_end).
3. Call `processStack` to finalize pending episodes before session closes.

### before_compaction hook
1. Call `processStack` to finalize any pending stack messages.
2. Reset watermark to `lastPushedIndex: -1` (transcript will be rewritten).
3. No need to flush messages — they're already on the Bonfires stack from agent_end.

### Heartbeat (unchanged)
- Calls `processStack` for all mapped agents every 20 min (+ jitter).
- Recovery tick continues as safety net.

### before_agent_start (unchanged)
- Queries Bonfires for context, returns prependContext.

## What changes

| Component | Before | After |
|-----------|--------|-------|
| `agent_end` capture | Throttled (15min), calls stack/add + processStack | Always calls stack/add, never processStack |
| `agent_end` throttle | `cfg.processing.intervalMinutes` gates entire capture | Removed — always push |
| `session_end` | Flush uncaptured + watermark only | Flush uncaptured + **processStack** |
| `before_compaction` | Flush from event.messages + processStack + reset | **processStack only** + reset watermark |
| Heartbeat processStack | Every 20min | Every 20min (unchanged) |
| `processing.intervalMinutes` config | Controls heartbeat tick interval + inactivity close timeout | Configurable (default 20min) |
| PM7 (compaction flush) | Complex flush logic | Simplified to processStack + watermark reset |
| PM8 (watermark reset guard) | Critical safety net | Retained but less critical (narrow race window) |
| PM9 (prependContext strip) | In bonfires-client.ts | Unchanged |
| Recovery tick | Backfills missed messages | Retained as safety net, less likely to fire |

## What stays the same
- Watermark ledger (needed to avoid duplicate stack/add pushes)
- `extractUserMessage()` (needed for search query extraction)
- `stripPrependContext()` (needed to prevent feedback loop)
- Paired message logic in `capture()` (needed for episode quality)
- `HostedBonfiresClient` internals (fetch, retry, toStackMsg)
- Heartbeat interval and recovery tick
- `before_agent_start` search + prependContext

## Open questions
1. **Does `session_end` fire on idle reset (30min)?** If yes, this architecture handles it. If no, messages are still safe on the Bonfires stack — only `processStack` would be delayed until the next heartbeat.
2. **Does context pruning fire any hook?** Same answer — messages are already on the stack, so no data loss regardless.
3. **Resolved:** `capture.throttleMinutes` replaced by `processing.intervalMinutes` (default 20min), which controls the heartbeat tick interval. Inactivity close timeout is 2x the interval.

## Acceptance criteria
- Every `agent_end` results in a `stack/add` call (no skips within throttle window).
- `processStack` is never called from `agent_end`.
- `session_end` calls `processStack` after flushing.
- `before_compaction` calls `processStack` and resets watermark without attempting to read `event.messages`.
- Existing tests updated. No regressions in wave1/wave2 suites.
- Production verification: send multiple messages within 15 minutes, confirm all appear on Bonfires stack (not just the first one).

## Risk
- **Increased API calls**: Every agent turn now hits `stack/add`. Bonfires API should handle this (it's designed for it), but monitor for rate limiting (429s).
- **Duplicate pushes on watermark reset**: If watermark desyncs and resets to 0, we may re-push messages already on the stack. Bonfires should deduplicate or this results in duplicate episodes. Acceptable for correctness — better to duplicate than to lose.
