# Wave 3 Scope (Recovery + Processing Reliability)

Primary goals:
1. Implement scheduled stack-processing heartbeat (15–20m cadence) for mapped agents.
2. Implement recovery/catch-up path for missed captures.
3. Add strict-mode guard for hosted mode (no silent mock fallback in non-dev contexts).
4. Add retriable-error retry/backoff+jitter policy for hosted HTTP operations.

Out of scope:
- New product features beyond reliability/catch-up.
- Payment-gated endpoints.
