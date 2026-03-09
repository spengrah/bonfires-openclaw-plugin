# Review Support — Wave 11 ContextEngine Phases X / Y

## Reviewer focus areas
1. **Active wiring clarity**
   - Phase X explicitly wires `afterTurn()` as active and deactivates `agent_end` for episodic writeback.
   - Phase Y explicitly wires `assemble()` as active and deactivates `before_agent_start` for Bonfires retrieval.
2. **Scope discipline**
   - Explicit content ingestion remains on existing Bonfires-native lanes.
   - `ingest()` / `ingestBatch()` are not treated as primary document-ingestion migration targets.
3. **Safety + resilience**
   - fail-open behavior preserved on writeback/retrieval failure.
4. **Prompt/runtime correctness**
   - stable guidance and dynamic retrieval boundaries remain explicit.

## Blocking findings (NO_GO)
1. Specs leave active wiring ambiguous.
2. Specs imply mixed rollout/coexistence despite unreleased-plugin decision.
3. Specs accidentally migrate explicit content-ingestion flows into ContextEngine phases.
4. Specs weaken fail-open guarantees.

## Conditional findings (CONDITIONAL_GO)
1. Wiring intent is correct but some file-level examples need tightening.
2. Legacy-code retention guidance could be clearer.
3. Test expectations need minor wording refinement.

## Required artifacts
1. Phase X spec + guidance
2. Phase Y spec + guidance
3. Wave 11 plan
4. Wave 11 verification matrix
5. Requirements index + traceability map updates
