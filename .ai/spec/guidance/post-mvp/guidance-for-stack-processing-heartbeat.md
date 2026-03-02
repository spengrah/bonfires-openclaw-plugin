# Guidance: Stack Processing Heartbeat (Reviewer Quality Criteria)

Reviewers should verify:
- Scheduling quality: deterministic cadence with bounded jitter/backoff policy.
- State quality: per-agent heartbeat metadata is persisted and auditable.
- Reliability quality: warning/partial-failure signals are surfaced without blocking foreground hooks.
- Separation quality: scheduler logic is decoupled from HTTP adapter details.
