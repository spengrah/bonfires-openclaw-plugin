# Guidance: Phase 1 — System Context Injection + Prompt-Policy Fallback

Reviewer quality criteria for PM18/PM19.

## Implementation guidance
1. Keep Phase 1 narrowly scoped to stable-guidance output shaping and policy-aware no-op handling.
2. Move stable, durable Bonfires guidance fully into `prependSystemContext`.
3. Do not keep stable guidance duplicated in `prependContext` as an active compatibility mode.
4. Treat dynamic retrieved snippets as separate from PM18/PM19 scope; their migration belongs to PM22/PM23.
5. Preserve clear heading/boundary formatting to minimize behavior drift.

## Policy/fallback guidance
1. Treat prompt-policy constraints as expected runtime conditions, not exceptional failures.
2. Never fail closed for this path; preserve turn continuity.
3. Emit concise structured logs for:
   - policy-constrained injection,
   - retrieval skip/no-op,
   - retrieval failure fallback.

## Test guidance
Reviewers should verify:
1. New tests cover system-context field emission paths.
2. Tests preserve backward-compatible default behavior.
3. Tests cover constrained prompt-injection policy behavior (no throw / no turn abort).
4. Existing retrieval and capture tests remain green.

## Out-of-scope enforcement
A reviewer SHOULD mark NO_GO if this wave introduces:
1. ContextEngine registration/migration,
2. ingestion architecture changes,
3. compaction pipeline redesign,
4. broad prompt-template rewrites beyond PM18/PM19.
