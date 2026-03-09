# Guidance: Phase X — `afterTurn()` episodic memory writeback

Date: 2026-03-08  
Status: Planned guidance

## Implementation guidance
1. Keep the `ContextEngine.afterTurn()` adapter thin.
2. Reuse existing stack-capture sanitization and metadata-normalization logic where possible.
3. Route Bonfires writes through shared internal services/client methods, not user-facing tool handlers.
4. Preserve fail-open behavior and structured diagnostics on write failure.
5. Do not support a mixed active runtime mode where both `agent_end` and `afterTurn()` perform episodic writeback.
6. Avoid scope creep into explicit content-ingestion features.

## Testing guidance
1. Add unit tests for post-turn delta slicing.
2. Add unit tests for stack payload shape and sanitization invariants.
3. Add unit tests for no-throw behavior on Bonfires write failure.
4. Add regression coverage proving content-ingestion flows are unaffected.
5. Add wiring-level checks proving active runtime registration no longer uses `agent_end` for episodic Bonfires writeback.

## Review focus
1. Correct active wiring: `afterTurn()` registered, `agent_end` deactivated for episodic writeback.
2. Sanitization parity with current stack capture.
3. Compatibility with watermark/ledger/recovery helpers.
