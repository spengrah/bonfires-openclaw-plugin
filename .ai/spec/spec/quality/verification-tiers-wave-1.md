# Wave 1 Verification Tier Map

## Tier 1 — Static/shape sanity
- Command: `npm run lint`
- Checks:
  - spec file presence/completeness (`scripts/spec-lint.mjs`)
  - no unresolved placeholders in spec docs

## Tier 2 — Deterministic spec/trace checks
- Command: `node scripts/spec-test.mjs`
- Checks:
  - requirements index includes R1..R6
  - verification checklist includes recovery-trigger gate
  - traceability map contains required requirement IDs

## Tier 3 — Runtime behavior tests
- Command: `node --test tests/*.test.mjs`
- Checks:
  - hook/tool behavior and edge-case assertions for Wave 1

## Tier 4 — Reviewer non-deterministic lenses
- Artifacts under `.ai/log/review/`
- Required lenses:
  - Correctness
  - Security/Attacker
  - Verification Quality

## Anti-gaming notes
- Tier 2+3 must execute real assertions (no placeholder exits).
- Reviewer outputs must acknowledge `delta.git_diff`.
- Review artifacts must be written to `.ai/log/review/*` and referenced in flanders state.
