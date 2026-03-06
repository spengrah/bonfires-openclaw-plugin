# Spec: before_compaction Capture Flush

## Goal
Flush all uncaptured messages to Bonfires before context compaction destroys them.

## Background
OpenClaw compacts session transcripts when the context window fills up, reducing the JSONL transcript from N messages down to a smaller set. Messages removed during compaction are permanently lost from the local transcript. If the capture ledger's `lastPushedIndex` is behind the compaction boundary, those messages are never sent to Bonfires.

## SDK contract
Hook receives:
- `event.messageCount: number` — total messages before compaction.
- `event.compactingCount: number` — how many messages are being compacted.
- `event.messages: Array` — the full pre-compaction message array.
- `event.sessionFile: string` — path to the session JSONL file.
- `ctx.sessionKey: string` — session identifier.
- `ctx.agentId?: string` — the mapped agent identifier.
- Return type: `void` (fire-and-forget hook).

## Requirements
1. Register a `before_compaction` hook alongside existing hooks.
2. On fire, push all messages from `lastPushedIndex + 1` through `event.messages.length - 1` to Bonfires `stack/add`, bypassing throttle.
3. After successful push, update the capture ledger watermark.
4. After compaction, the transcript resets to fewer messages. Set `lastPushedIndex` to `-1` (or `0`) so the next `agent_end` captures from the start of the post-compaction transcript.
5. If the push fails, log a warning but do not block compaction. The recovery heartbeat can attempt backfill later (though the compacted messages will be gone from the local transcript by then — this is best-effort).
6. Share the same `CaptureLedger` instance and `BonfiresClient` as `agent_end`.

## Acceptance
- Simulated compaction with uncaptured messages results in a flush to Bonfires.
- Ledger watermark is reset after compaction so subsequent `agent_end` captures from index 0.
- Compaction is not blocked by a failed Bonfires push.
- No duplicate messages when `lastPushedIndex` is already current (no uncaptured messages).
