# Spec: Phase X — ContextEngine `afterTurn()` episodic memory writeback

Date: 2026-03-08  
Status: Planned

## Scope
This phase introduces a Bonfires-backed OpenClaw `ContextEngine.afterTurn()` implementation for post-turn episodic memory capture.

Primary objective:
- move current Bonfires stack writeback responsibilities from legacy hook-centric flow toward the native `ContextEngine` post-turn lifecycle.

Primary Bonfires target:
- `bonfires:/stack/add`

## Goals
1. Use OpenClaw’s native post-turn context lifecycle for episodic memory ingestion.
2. Preserve current stack-capture semantics, sanitization expectations, and fail-open behavior.
3. Replace the active legacy `agent_end` writeback path rather than maintaining a mixed rollout.
4. Avoid changing explicit Bonfires content ingestion flows.

## Non-goals
1. No migration of explicit document/PDF/link ingestion to `ingest()`/`ingestBatch()`.
2. No reintroduction of per-turn Bonfires retrieval in this phase.
3. No ContextEngine compaction/subagent lifecycle work in this phase.
4. No Bonfires storage-schema redesign.

## Functional requirements

### PM20 — Native post-turn episodic memory writeback
1. The plugin MUST be able to register and expose a Bonfires-backed `ContextEngine.afterTurn()` implementation.
2. `afterTurn()` MUST derive the post-turn delta using OpenClaw-provided turn context (including `prePromptMessageCount` semantics or equivalent message-slice logic).
3. The implementation MUST write eligible episodic memory artifacts to Bonfires stack ingestion (`stack/add`) using shared internal services/client logic.
4. The implementation MUST preserve existing message sanitization and metadata-normalization behavior required for stack capture correctness.
5. The implementation MUST remain fail-open: Bonfires outages, malformed payloads, or writeback failures MUST not abort turn execution.

### PM21 — Legacy `agent_end` path deactivation and migration boundary
1. Existing explicit Bonfires content-ingestion flows (`ingest_content`, `ingest_pdf`, approval-gated link ingestion, discovery-selected ingestion, related tools/services) MUST remain outside this phase’s `ContextEngine` migration scope.
2. Active writeback responsibilities MUST be isolated to episodic/conversational capture only.
3. The implementation SHOULD reuse existing shared capture/writeback helpers where possible rather than duplicating Bonfires-specific logic in the `ContextEngine` adapter.
4. `afterTurn()` MUST become the only active episodic-memory writeback path in the implementation wave; mixed active writeback modes are out of scope.
5. The current active `agent_end` writeback path MUST be removed from active execution paths for episodic memory capture once `afterTurn()` is implemented.
6. Legacy source code MAY remain in the repository temporarily, but it MUST NOT remain wired into active runtime flow for episodic writeback.

## Behavioral notes
1. `afterTurn()` is the preferred successor to current `agent_end`-style episodic capture.
2. The `ContextEngine` layer SHOULD remain thin and delegate to shared internal capture/writeback services.
3. Writeback dedupe/watermark/ledger behavior MAY remain in existing internal services so long as externally visible behavior remains stable.

## Expected active wiring changes
1. Plugin registration/wiring (for example in `src/index.ts`) MUST expose/register the Bonfires `ContextEngine.afterTurn()` path as the active episodic memory writeback surface.
2. Existing active `agent_end` hook wiring for episodic Bonfires stack writeback MUST be removed or disabled from the runtime registration path.
3. Shared stack-capture helpers MAY remain in source, but runtime entry should come from `ContextEngine.afterTurn()` rather than legacy hook dispatch.
4. Any inactive legacy hook implementation retained in source SHOULD be clearly commented or isolated to prevent accidental reactivation.

## Acceptance criteria
1. Tests verify `afterTurn()` receives and processes only post-turn message delta for stack writeback.
2. Tests verify stack-write payloads preserve required sanitization/normalization invariants.
3. Tests verify Bonfires write failures are fail-open and do not abort the turn.
4. Tests verify migration does not alter explicit content-ingestion pathways.
5. Existing relevant test suite remains green.

## Risks
1. Message-delta interpretation could drift from current behavior if pre-prompt slicing is mishandled.
2. Deactivating `agent_end` may expose hidden coupling with watermark/recovery helpers.
3. Inactive legacy code could become misleading if not clearly marked as non-active.

## Deprecation / replacement policy
1. `ContextEngine.afterTurn()` is the replacement path for active episodic Bonfires stack writeback.
2. The legacy `agent_end` path is to be treated as replaced for active runtime behavior in this phase.
3. Legacy implementation code may remain temporarily for reference or fallback investigation, but it should be clearly marked as inactive and should not receive new feature work.

## Rollout
1. Implement `afterTurn()` as the active writeback path.
2. Remove `agent_end` from active runtime wiring for episodic writeback in the same phase.
3. Verify behavior with targeted unit tests against the new active path.
