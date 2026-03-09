# Guidance: Phase Y — `assemble()` Bonfires retrieval integration

Date: 2026-03-08  
Status: Planned guidance

## Implementation guidance
1. Keep `ContextEngine.assemble()` adapter thin and service-driven.
2. Route retrieval through shared internal Bonfires retrieval services/client logic, not user-facing `bonfires_search`-style tool handlers.
3. Preserve fail-open behavior on retrieval errors or empty results.
4. Keep PM18/PM19-owned stable Bonfires guidance and PM22/PM23 dynamic retrieved snippets explicitly separated.
5. Do not support a mixed active runtime mode where both `before_agent_start` and `assemble()` perform dynamic retrieval.
6. Do not implicitly re-enable per-turn recall via implementation side effects.

## Testing guidance
1. Add tests for retrieval-request construction from session/messages/token budget.
2. Add tests for no-op behavior on empty/failing `/delve` results.
3. Add tests for compatibility defaults remaining off unless explicitly enabled.
4. Add wiring-level checks proving active runtime registration no longer uses `before_agent_start` for Bonfires turn-time retrieval.

## Review focus
1. Correct active wiring: `assemble()` registered, `before_agent_start` deactivated for Bonfires retrieval.
2. Prompt-boundary clarity between stable guidance and dynamic snippets.
3. Token-budget safety and fail-open degradation.
