# Spec: Phase Y — ContextEngine `assemble()` Bonfires retrieval integration

Date: 2026-03-08  
Status: Planned

## Scope
This phase introduces a Bonfires-backed OpenClaw `ContextEngine.assemble()` integration for pre-turn retrieval/context assembly.

Primary objective:
- move Bonfires turn-time retrieval from legacy retrieval-hook flow to native `ContextEngine.assemble()` when/if per-turn recall is re-enabled.

Primary Bonfires target:
- `bonfires:/delve`

## Goals
1. Use OpenClaw’s native pre-turn context assembly lifecycle for Bonfires retrieval.
2. Preserve fail-open retrieval behavior and compatibility defaults.
3. Support separation between stable guidance/system-context placement and dynamic retrieved snippets.
4. Replace the active legacy `before_agent_start` retrieval path rather than maintaining a mixed rollout.

## Non-goals
1. No automatic re-enable of per-turn Bonfires retrieval merely by introducing this spec.
2. No explicit content-ingestion migration in this phase.
3. No compaction/subagent ContextEngine lifecycle work in this phase.
4. No broad prompt-template redesign beyond retrieval assembly boundaries.

## Functional requirements

### PM22 — Native pre-turn Bonfires retrieval assembly
1. The plugin MUST be able to register and expose a Bonfires-backed `ContextEngine.assemble()` implementation.
2. `assemble()` MUST derive retrieval inputs from current session/message context and applicable token budget.
3. The implementation MUST call shared internal Bonfires retrieval logic that maps to `/delve` (or equivalent retrieval backend), rather than routing through user-facing tool handlers.
4. `assemble()`-produced dynamic retrieval context MUST remain conceptually and format-wise distinct from the stable Bonfires guidance owned by PM18/PM19.
5. PM18/PM19-owned stable Bonfires guidance remains placed via `prependSystemContext`; PM22 MUST NOT redefine stable-guidance ownership as part of retrieval migration.
6. Retrieval failures, empty results, or backend outages MUST degrade fail-open without aborting the turn.

### PM23 — Legacy `before_agent_start` path deactivation and retrieval boundary
1. Per-turn Bonfires retrieval MUST remain opt-in or otherwise disabled by default until explicitly re-enabled by product decision/config.
2. Stable guidance placement behavior from Phase 1 MUST remain compatible with any future `assemble()`-based dynamic retrieval path.
3. Dynamic retrieved snippets SHOULD remain separable from stable guidance so formatting and behavioral boundaries stay deterministic.
4. `assemble()` MUST become the only active dynamic retrieval path when retrieval is enabled; mixed active retrieval modes are out of scope.
5. Once `assemble()` is implemented for active retrieval, the legacy `before_agent_start` retrieval path MUST be removed from active runtime wiring for Bonfires turn-time retrieval.
6. Legacy source code MAY remain in the repository temporarily, but it MUST NOT remain wired into active runtime flow for Bonfires retrieval.

## Behavioral notes
1. `assemble()` is the preferred successor to `before_agent_start` for turn-time Bonfires retrieval.
2. Retrieval logic SHOULD remain in shared internal retrieval services; the `ContextEngine` adapter should primarily translate OpenClaw engine inputs/outputs.
3. Token-budget-aware retrieval sizing SHOULD be handled at the retrieval-service boundary.

## Expected active wiring changes
1. Plugin registration/wiring (for example in `src/index.ts`) MUST expose/register the Bonfires `ContextEngine.assemble()` path as the active Bonfires retrieval surface.
2. Existing active `before_agent_start` hook wiring for Bonfires turn-time retrieval MUST be removed or disabled from the runtime registration path.
3. Stable-guidance/system-context support MAY continue to reuse shared formatting helpers, but active dynamic retrieval entry should come from `ContextEngine.assemble()` rather than legacy retrieval hook dispatch.
4. Any inactive legacy hook implementation retained in source SHOULD be clearly commented or isolated to prevent accidental reactivation.

## Acceptance criteria
1. Tests verify `assemble()` can map current session/messages into Bonfires retrieval requests.
2. Tests verify returned retrieval content is injected through supported `assemble()` outputs without malformed prompt state.
3. Tests verify empty/failing retrieval degrades to no-op and does not abort the turn.
4. Tests verify compatibility defaults do not re-enable per-turn recall unless explicitly configured.
5. Existing relevant test suite remains green.

## Risks
1. Prompt-behavior drift if stable and dynamic context boundaries are blurred.
2. Token-budget regressions if retrieval sizing is not bounded correctly.
3. Deactivating `before_agent_start` may surface hidden assumptions elsewhere in retrieval wiring.

## Deprecation / replacement policy
1. `ContextEngine.assemble()` is the replacement path for active Bonfires turn-time retrieval.
2. The legacy `before_agent_start` path is to be treated as replaced for active runtime behavior in this phase.
3. Legacy implementation code may remain temporarily for reference or fallback investigation, but it should be clearly marked as inactive and should not receive new feature work.

## Rollout
1. Spec first; keep per-turn recall disabled by default until intentionally re-enabled.
2. When implementing retrieval migration, wire `assemble()` as the active retrieval path.
3. Remove `before_agent_start` from active Bonfires retrieval wiring in the same phase.
4. Validate injection boundaries and no-op degradation against the new active path.
