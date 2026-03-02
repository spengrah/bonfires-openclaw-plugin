# Spec: Stack Processing Heartbeat

## Goal
Ensure stack-added messages are regularly converted into episodes.

## Requirements
1. Trigger `POST /agents/{agent_id}/stack/process` on 15–20 minute cadence.
2. Heartbeat runner is idempotent and safe to rerun.
3. Failures apply bounded retry/backoff and emit structured warnings.
4. Runner tracks last-attempt and last-success metadata per agent.
5. Heartbeat must not block foreground hook execution.

## Acceptance
- Active mapped agents receive periodic process calls.
- Transient failures retry and recover without duplicate harmful behavior.
- Persistent failures are visible in logs/artifacts.
