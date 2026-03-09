# Spec: Phase 1 — System Context Injection + Prompt-Policy Fallback

Date: 2026-03-08  
Status: Planned (implementation pending)

## Scope
This spec defines a small, low-risk Phase 1 upgrade for OpenClaw >= v2026.3.7 compatibility:

1. Prefer system-context fields for stable Bonfires guidance.
2. Preserve fail-open behavior when prompt mutation is constrained by runtime policy.

## Goals
1. Reduce repeated token churn from re-prepending stable guidance into user prompt text.
2. Keep Bonfires context behavior robust if prompt injection is disabled by policy.
3. Preserve existing default behavior and compatibility for current deployments.

## Non-goals
1. No ContextEngine migration in this phase.
2. No ingestion pipeline redesign in this phase.
3. No compaction/writeback lifecycle redesign in this phase.

## Functional requirements

### PM18 — System-context placement for stable guidance
1. Stable Bonfires guidance MUST migrate from legacy `prependContext` placement to `prependSystemContext`.
2. Stable Bonfires guidance MUST NOT continue to be emitted in `prependContext` as a normal active path once PM18 is implemented.
3. Dynamic per-turn retrieved snippets remain out of scope for PM18 and are addressed separately by PM22/PM23.
4. A deterministic formatting boundary MUST be retained between stable system guidance and any future dynamic retrieval snippets.

### PM19 — Prompt-policy-aware fail-open behavior
1. If runtime policy constrains prompt mutation (for example via plugin hook policy), the plugin MUST not throw or abort turn execution.
2. Retrieval errors and policy-constrained paths MUST degrade to no-op context injection while allowing the turn to proceed.
3. The plugin SHOULD emit structured diagnostics for policy-constrained or skipped context-injection paths.
4. Existing safety posture (graceful Bonfires outage handling) MUST remain intact.

## Configuration behavior (phase 1)
1. Default behavior SHOULD be conservative and backward compatible.
2. If a placement toggle/config exists, default SHOULD preserve current output semantics unless explicitly enabled.
3. Any new config MUST be optional and non-breaking.

## Acceptance criteria
1. Unit tests verify stable Bonfires guidance is emitted in `prependSystemContext`.
2. Unit tests verify stable Bonfires guidance is not redundantly emitted in `prependContext` once PM18 behavior is enabled.
3. Unit tests verify policy-constrained system-context injection paths are fail-open and do not crash turn handling.
4. Existing test suite remains green with no regressions in retrieval/capture behavior outside the intended stable-guidance placement change.

## Risks
1. Prompt placement changes could alter model behavior if stable guidance is moved too aggressively.
2. Runtime policy behavior may vary by deployment config; tests must include constrained-path simulation.

## Rollout
1. Implement behind conservative defaults.
2. Validate in local tests first, then in upgraded OpenClaw runtime.
3. Defer broader ContextEngine adoption to a later wave.
