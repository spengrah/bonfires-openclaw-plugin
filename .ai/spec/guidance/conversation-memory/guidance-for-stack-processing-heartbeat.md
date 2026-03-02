# Guidance: Stack Processing Heartbeat (Reviewer Quality Criteria)

Reviewers should verify:
- Scheduling quality: 20-minute base cadence with 0–120s jitter is implemented as specified.
- Retry quality: retriable failures use exactly 3-attempt bounded retry with 5s/15s backoff.
- State quality: per-agent metadata (`last_attempt_at`, `last_success_at`, `last_status`, `consecutive_failures`) is persisted and auditable.
- Reliability quality: warning/partial-failure signals are surfaced without blocking foreground hooks.
- Separation quality: scheduler logic is decoupled from HTTP adapter details.
