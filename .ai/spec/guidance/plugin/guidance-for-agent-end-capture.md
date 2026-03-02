# Guidance: agent_end Capture

- Encapsulate watermark logic behind `CaptureLedger` interface from spec.
- Record ranges (`startIndex`, `endIndex`) to simplify idempotency checks.
- Update ledger only after confirmed successful API call.
- Use `ctx.sessionKey`; if absent, skip capture and log (non-fatal).
