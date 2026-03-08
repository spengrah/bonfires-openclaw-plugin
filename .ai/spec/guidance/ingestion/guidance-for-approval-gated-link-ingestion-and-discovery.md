# Guidance: PM16/PM17 — approval-gated link ingestion and discovery

## Implementation approach
1. Reuse existing PM15 modules first:
   - `transport-safety.ts`
   - `bonfires-ingest-link.ts`
   - `ingestion-core.ts`
2. Add orchestration, not replacement:
   - new multi-link ingestion wrapper (`bonfires_ingest_links`)
   - new discovery tool (`discover_links`) behind flag
3. Keep `before_agent_start` lightweight:
   - detect link presence
   - inject short instruction block
   - avoid running heavy fetch/ingest in hook path

## Approval semantics
1. User-provided links:
   - agent must ask approval before Bonfires ingestion
   - ingest only explicitly approved URLs
2. Discovery links:
   - selected-set approval once
   - persist approval in turn-local context only

## Snippet generation
1. Prefer deterministic extraction:
   - HTML: reuse readable-text extraction; take first meaningful chunk
   - Non-HTML: minimal snippet or omit gracefully
2. Keep short snippets (~160-240 chars) for low token overhead.

## Naming boundary
1. Use generic discovery tool name (`discover_links`) because discovery is source-agnostic.
2. Keep Bonfires-specific naming for ingestion sink (`bonfires_ingest_links`).

## Rollout policy
1. PM17 (discovery) remains feature-flagged until PM16 proves stable in production.
2. Enable PM17 progressively after PM16 validation artifacts pass.

## Failure handling
1. Per-link failure should not abort entire batch by default.
2. Return per-link status and run summary.
3. Duplicate is success/no-op.

## Logging and artifacts
1. Emit run-level summary artifact in `.ai/log/plan/` for production verification.
2. Include blocked/error reason categories for review.
