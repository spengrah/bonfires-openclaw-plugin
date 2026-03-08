# Spec: Watermark Reset on Transcript Truncation

## Goal
Prevent silent message loss when the session transcript is shorter than the capture ledger's `lastPushedIndex`.

## Background
Context compaction, session resets, and JSONL file rewrites can cause the message array passed to `agent_end` to be shorter than the stored `lastPushedIndex`. When this happens, `msgs.slice(lastPushedIndex + 1)` returns an empty array and every subsequent message is silently dropped.

## Requirements
1. In `agent_end` (and `session_end`), before computing the message slice, check whether `lastPushedIndex >= msgs.length`.
2. If yes, reset `start` to `0` and log a structured warning indicating the watermark was reset (include `sessionKey`, old `lastPushedIndex`, and current `msgs.length`).
3. Push the full current message array (from index 0) to Bonfires. Bonfires deduplicates at the episode level, so re-sending already-captured messages is safe.
4. Update the watermark to the new `msgs.length - 1` after successful push.
5. This is a safety net. The primary fix is the `before_compaction` flush (see `spec-for-compaction-flush.md`). This guard handles cases where compaction happens without the hook firing (e.g., plugin not loaded at compaction time, or OpenClaw versions without the `before_compaction` hook).

## Acceptance
- `agent_end` with `lastPushedIndex=109` and `msgs.length=50` results in a push of all 50 messages (not an empty slice).
- A warning is logged when the watermark is reset.
- Normal operation (lastPushedIndex < msgs.length) is unaffected.
