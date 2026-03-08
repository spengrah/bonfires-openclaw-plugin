> **Superseded by PM10.** The implementation now calls `processStack` and resets the watermark.
> The original PM7 design (read `event.messages` and flush) was replaced because `event.messages`
> arrives empty in production.

# Spec: before_compaction Hook (PM7 → PM10)

## Current behavior (PM10)
1. Call `processStack` to finalize any pending stack messages into episodes.
2. Reset watermark to `lastPushedIndex: -1` (transcript will be rewritten, indices invalidated).
3. No message flushing — messages are already on the Bonfires stack from immediate `agent_end` capture.

## Why the original design was replaced
- `event.messages` is empty when the `before_compaction` hook fires (discovered in production).
- PM10's immediate capture means messages are already on the stack before compaction occurs.
- The only remaining concern is finalizing episodes (`processStack`) and resetting the watermark.

## Acceptance criteria
- `before_compaction` calls `processStack`.
- Watermark is reset to `-1` after compaction.
- Compaction is not blocked by a failed `processStack` call.
