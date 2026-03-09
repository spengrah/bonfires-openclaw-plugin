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
   - after approval, execution must be mediated through a session-local approval token bound to the approved URL subset
   - do not pass a broader candidate/requested URL list or raw caller-supplied approved URL list as executable input
2. Discovery links:
   - selected-set approval once
   - execution must be mediated through a session-local approval token bound to the selected approved subset
   - persist approval binding in session-local context
3. Contract enforcement:
   - `bonfires_ingest_links` must require `approvalToken`
   - the tool must resolve the token to a session-local approved URL subset
   - malformed/missing/expired/cross-session/unverifiable approval tokens must fail closed for ingestion execution
   - caller assertions alone are not sufficient proof of approval provenance
   - same-session reuse of an already approved URL set is allowed by product policy; exact-turn binding is not required

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
2. Enable PM17 progressively only after PM16 validation artifacts pass.
3. Required enabling evidence is:
   - `.ai/log/plan/pm14-pm15-production-validation-20260308.md`
   - `.ai/log/review/review-verification-quality-20260307w9-remediation.md`
   - `.ai/log/review/review-correctness-20260307w9-remediation.md`

## Failure handling
1. Per-link failure should not abort entire batch by default.
2. Return per-link status and run summary.
3. Duplicate is success/no-op.

## Logging and artifacts
1. Emit run-level summary artifact in `.ai/log/plan/` for production verification.
2. Include blocked/error reason categories for review.
3. For approval-token validation, record the token lifecycle and rejection categories in tests/review artifacts: missing token, expired token, cross-session token, and token/approved-set mismatch.
4. Security review expectations for PM16/PM17 should align to the accepted product policy: session-scoped approval provenance is sufficient; turn-local single-use semantics are out of scope unless product policy changes.
