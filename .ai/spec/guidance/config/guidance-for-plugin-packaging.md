# Guidance — Plugin Packaging and OpenClaw Integration

## Reviewer intent
Evaluate whether packaging and runtime integration choices make bonfires-plugin deployable, maintainable, and safe for multi-user OpenClaw installs.

## Criteria

1. **Schema quality**
   - Config schema should be strict, explicit, and UI-friendly.
   - Defaults should be sensible for first install without hiding critical misconfiguration.

2. **Secret handling ergonomics**
   - Users should be able to keep sensitive values out of plaintext config.
   - Env fallback behavior should be transparent and documented (including precedence).

3. **Heartbeat boundary clarity**
   - Docs should prevent operator confusion between Gateway heartbeat and plugin heartbeat.
   - Failure/alert surfaces should indicate which subsystem emitted the signal.

4. **State durability and portability**
   - State locations should survive restart/reload and align with OpenClaw operational conventions.
   - Paths should be configurable and avoid coupling normal runtime to planning logs.

5. **Lifecycle hygiene**
   - Timers/services should start once, stop cleanly, and avoid duplicated loops after reload.
   - Service registration should align with plugin runtime lifecycle semantics.

6. **Operator experience**
   - Install/enable/config path should be short and deterministic.
   - Troubleshooting guidance should cover the common deployment errors (missing env, invalid mapping, hosted strict mode).

## Concern signals
- Manifest present but schema too permissive (`additionalProperties: true` broadly).
- Runtime behavior that implicitly writes critical state into dev/planning paths.
- Docs that use “heartbeat” without disambiguating subsystem scope.
- Background loops that cannot be controlled/restarted predictably.
