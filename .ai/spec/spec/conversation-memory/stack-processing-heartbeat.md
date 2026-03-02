# Spec: Stack Processing Heartbeat

## Goal
Ensure stack-added messages are regularly converted into episodes.

## Requirements
1. Trigger `POST /agents/{agent_id}/stack/process` on a **fixed 20-minute base cadence**.
2. Add per-run jitter of **0–120 seconds** to avoid synchronized spikes.
3. Retries for retriable failures (network/429/5xx):
   - max attempts: **3** total per scheduled tick
   - backoff schedule: **5s, 15s**
   - stop retries on non-retriable 4xx (except 429).
4. Heartbeat runner is idempotent and safe to rerun.
5. Runner tracks per-agent metadata: `last_attempt_at`, `last_success_at`, `last_status`, `consecutive_failures`.
6. Heartbeat execution must not block foreground hook execution.

## Acceptance
- Active mapped agents receive process calls on ~20m cadence (+ jitter).
- Retriable failures recover within bounded retries without duplicate harmful behavior.
- Persistent failures are visible in logs/artifacts with increasing `consecutive_failures`.
