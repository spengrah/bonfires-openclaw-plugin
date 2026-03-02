# Spec: MVP Verification Matrix

1. Per-turn retrieval executes every turn.
2. Tool returns deterministic schema.
3. Throttle and incremental capture work per session.
4. Recovery backfills missed ranges without duplicates.
5. Session-end flush captures final slice.
