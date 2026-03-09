# Bonfires ContextEngine Architecture Sketch

Date: 2026-03-08  
Status: exploratory design sketch

## Proposed mental model

Use OpenClaw `ContextEngine` as the runtime lifecycle/orchestration layer, and use Bonfires as the actual context backend for storage, enrichment, indexing, and retrieval.

In other words:
- **OpenClaw ContextEngine** decides **when** context should be ingested/assembled.
- **bonfires-plugin internal services/client** decide **how** to translate those lifecycle events into Bonfires API operations.
- **Bonfires** remains the system of record for context storage/retrieval/enrichment.
- **User-facing tools** remain explicit/manual surfaces, not the internal plumbing for ContextEngine methods.

## Proposed method mapping

Update after upstream invocation review:
- `afterTurn()` is the primary native post-turn write surface.
- `assemble()` is the primary native pre-turn retrieval surface.
- `ingest()` and `ingestBatch()` are currently better understood as post-turn fallback ingestion APIs in OpenClaw’s invocation order, not the main target for explicit Bonfires document-ingestion migration.

### 1. `afterTurn()` -> episodic memory ingestion
**Primary Bonfires target:** `bonfires:/stack/add`

Use `afterTurn()` as the canonical replacement for current `agent_end`-style turn-complete capture.

Responsibilities:
1. inspect completed turn outcome,
2. sanitize/normalize captured messages,
3. derive episodic memory candidates,
4. write turn artifacts to Bonfires stack lane,
5. record watermark / dedupe / retry metadata locally as needed.

Why this fits:
- `afterTurn()` is semantically aligned with “the turn is done; now persist what matters.”
- It is cleaner than today’s hook-based post-turn writeback.

### 2. `ingest()` -> fallback single-message conversational ingestion

Current upstream invocation semantics suggest `ingest()` is best treated as a fallback post-turn ingestion API, used when `afterTurn()` and `ingestBatch()` are not implemented.

Implication for Bonfires:
- do **not** treat `ingest()` as the primary target for explicit document/PDF/link ingestion migration.
- if implemented, it should remain compatible with conversational post-turn ingestion semantics.

Important nuance:
- `ingest()` should call shared **internal ingestion services**, not user-facing `bonfires_ingest_*` tools directly.
- The tools can share the same underlying service layer.

### 3. `ingestBatch()` -> fallback bulk conversational ingestion / recovery

Current upstream invocation semantics suggest `ingestBatch()` is best treated as a fallback bulk post-turn ingestion API, used when `afterTurn()` is not implemented.

Implication for Bonfires:
- it can still be useful for conversational recovery/reconciliation,
- but it should not be the main target for explicit content-ingestion migration.

Responsibilities if used:
1. normalize a batch,
2. dedupe/idempotency handling,
3. resolve profile/agent mapping once per batch where possible,
4. write efficiently to Bonfires,
5. return counts/status for recovery bookkeeping.

### 4. `assemble()` -> retrieval / context recall
**Primary Bonfires target:** `bonfires:/delve`

Use `assemble()` if/when per-turn Bonfires recall is re-enabled.

Responsibilities:
1. derive retrieval query from current turn/runtime context,
2. fetch relevant Bonfires context,
3. format injected context for OpenClaw,
4. optionally add stable system guidance separately from dynamic snippets,
5. degrade gracefully on outage/empty results.

Current status:
- per-turn Bonfires querying is currently off, so this remains a future-ready path rather than an immediate implementation target.

## Suggested layering

### Layer 1: ContextEngine lifecycle adapter
A Bonfires `ContextEngine` implementation should be thin.

Responsibilities:
- map OpenClaw lifecycle calls to internal service calls,
- translate engine inputs/outputs,
- avoid embedding Bonfires-specific business logic directly where possible.

### Layer 2: Internal Bonfires services
Shared internal functions should encapsulate actual backend behavior.

Suggested service families:
1. `conversationIngestionService`
   - used by `afterTurn()` and conversational recovery flows
2. `contentIngestionService`
   - used by `ingest()` and `ingestBatch()` for documents/URLs/PDFs
3. `retrievalService`
   - used by `assemble()`
4. `mappingService`
   - resolves agent/profile/ingestion-target context
5. `dedupeLedgerService`
   - watermark/hash/idempotency bookkeeping

### Layer 3: Bonfires client
Low-level HTTP/API client only.

Responsibilities:
- perform Bonfires requests,
- normalize errors,
- expose route-specific methods,
- remain reusable by both tools and ContextEngine-backed services.

### Layer 4: user-facing tools
Examples:
- `bonfires_search`
- `bonfires_stack_search`
- `bonfires_ingest_link`
- future explicit ingestion tools

These should remain explicit/manual surfaces.
They should **share internal services** with ContextEngine flows where appropriate, but should not be the engine’s internal dependency boundary.

## Concrete mapping summary

| ContextEngine method | Bonfires responsibility | Notes |
|---|---|---|
| `afterTurn()` | episodic memory / stack writeback | likely replacement for current `agent_end` path |
| `ingest()` | fallback single-message conversational ingestion | not primary document-ingestion migration target |
| `ingestBatch()` | fallback bulk conversational ingestion / recovery | not primary document-ingestion migration target |
| `assemble()` | retrieval / context recall | map to `/delve` when recall is enabled |

## Does this mapping make sense?

**Yes, mostly.**

But two caveats:

### Caveat 1: `ingest()` can end up overloaded
If `ingest()` handles both:
1. conversation-derived durable note ingestion, and
2. external document/PDF/URL ingestion,

then the internal service contract needs a strong content-type model.

Suggested mitigation:
- use a normalized ingestion envelope with explicit `kind`, such as:
  - `conversation_turn`
  - `durable_note`
  - `url_content`
  - `pdf_document`
  - `web_document`

### Caveat 2: `afterTurn()` vs `ingest()` boundary must stay clear
If `afterTurn()` already handles episodic memory writeback, then `ingest()` should be reserved primarily for **explicit content/document ingestion**, not generic turn capture.

That separation seems healthy:
- `afterTurn()` = conversational/episodic memory
- `ingest()` = explicit content/document ingestion
- `ingestBatch()` = bulk equivalent / recovery
- `assemble()` = retrieval

## Suggested incremental adoption order

### PM18 / PM19
1. keep current hooks,
2. implement prompt/system-context compatibility and policy fail-open behavior,
3. do not migrate runtime retrieval/writeback responsibilities to ContextEngine yet.

### PM20 / PM21
1. add Bonfires `ContextEngine` with `afterTurn()` only,
2. route episodic turn capture through shared conversation ingestion service,
3. remove legacy `agent_end` episodic writeback from active runtime wiring,
4. keep explicit content/document ingestion on existing Bonfires-native lanes.

### PM22 / PM23
1. optionally add `assemble()` when/if per-turn recall is re-enabled,
2. route dynamic retrieval through shared retrieval service,
3. remove legacy `before_agent_start` Bonfires retrieval wiring from active runtime flow,
4. keep stable guidance/system-context behavior separable from dynamic retrieval snippets,
5. treat PM18/PM19-owned `prependSystemContext` guidance as distinct from PM22/PM23 retrieval output responsibilities.

## Tentative conclusion

Revised conclusion after checking upstream invocation timing:
- `afterTurn()` -> `stack/add`
- `assemble()` -> `/delve`
- explicit Bonfires content ingestion should remain on existing Bonfires-native ingestion lanes
- `ingest()` / `ingestBatch()` should be treated as fallback conversational ingestion surfaces rather than the main migration targets for document ingestion

The key design rule is:

> ContextEngine methods should call shared internal Bonfires services, not route through user-facing tool handlers.

That gives the cleanest separation of concerns and the best chance of keeping the plugin maintainable as OpenClaw’s context APIs mature.
