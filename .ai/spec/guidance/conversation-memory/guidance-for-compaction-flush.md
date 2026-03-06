# Guidance: before_compaction Flush (Reviewer Quality Criteria)

Reviewers should verify:
- Flush completeness: all messages between `lastPushedIndex + 1` and `event.messages.length - 1` are included in the push.
- Throttle bypass: the compaction flush must NOT respect the 15-minute throttle window — compaction is time-critical and messages will be lost if not flushed immediately.
- Watermark reset: after the flush, `lastPushedIndex` must be set to a value that causes the next `agent_end` to capture from the beginning of the post-compaction transcript (not from the old high-water mark).
- Non-blocking: a failed Bonfires push must not prevent or delay compaction. The hook is fire-and-forget.
- Shared state: the hook must use the same `CaptureLedger` and `BonfiresClient` instances as `agent_end` and `session_end` — no separate state.
- Edge case — no uncaptured messages: if `lastPushedIndex >= event.messages.length - 1`, the hook should still reset the watermark (compaction will change the transcript length) but skip the push.
- Edge case — ledger has no entry for this session: treat as `lastPushedIndex = -1` (flush all messages).
