# Guidance: Watermark Reset on Truncation (Reviewer Quality Criteria)

Reviewers should verify:
- Detection correctness: the guard triggers when `lastPushedIndex >= msgs.length`, not just `>`. An index equal to length means the last-pushed message is beyond the array bounds.
- Warning quality: the log message includes enough context to diagnose why the reset happened (sessionKey, old index, new length). Use `deps.logger?.warn?.(...)` consistent with existing error handling patterns.
- Full recapture: when the guard triggers, all messages from index 0 are pushed. Do not attempt to infer which messages are "new" — that information is lost after truncation.
- No infinite loop: the watermark must be updated after the push so the next `agent_end` doesn't trigger the guard again on the same message set.
- Applies to both `agent_end` and `session_end`: both hooks use the same watermark-based slicing logic and both need this guard.
- Interaction with `before_compaction`: if the compaction flush ran successfully and reset the watermark, this guard should not trigger. It's a fallback for when the compaction flush didn't run.
