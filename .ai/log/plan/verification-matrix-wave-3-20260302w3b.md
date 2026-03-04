# Verification Matrix — Wave 3 (20260302w3b)

| Requirement / Criterion | Gate command(s) | Pass threshold | Implementing gate artifact |
|---|---|---|---|
| PM2 heartbeat cadence + jitter (`conversation-memory/stack-processing-heartbeat.md`) | `npm run test` | Tests cover 20m base cadence and jitter bounds (0–120s) with deterministic assertions; no failures | `tests/*.test.ts` + `scripts/spec-test.ts` |
| PM2 bounded retriable retries for process flow | `npm run test` | Tests assert max 3 attempts, backoff schedule 5s/15s, no retries on non-retriable 4xx except 429 | `tests/*.test.ts` |
| PM2 heartbeat metadata persistence (`last_attempt_at`, `last_success_at`, `last_status`, `consecutive_failures`) | `npm run test` | Metadata state assertions pass across success/failure transitions | `tests/*.test.ts` |
| R4 recovery catch-up idempotence + dedupe key + overlap policy | `npm run test` | Recovery tests verify no duplicate pushes; overlap resolution uses larger `endIndex`; `endIndex <= lastPushedIndex` is skipped | `tests/*.test.ts` |
| R4 session-end flush fallback formula (`2 * capture.throttleMinutes`) | `npm run test` | Tests verify canonical close-timeout formula and first-tick flush behavior | `tests/*.test.ts` |
| PM1 hosted strict-mode guard (no silent mock fallback in non-dev) | `npm run test` | Strict mode path fails loudly when hosted prerequisites are missing in non-dev context; fallback only allowed per policy | `tests/*.test.ts` |
| PM1 strict-mode precedence over mock fallback (normalization note) | `npm run test` | Test coverage includes explicit branch proving strict-mode precedence in non-dev hosted context | `tests/wave2-hosted.test.ts` (or successor hosted-path test file) |
| Unified retry-policy coverage across touched heartbeat + hosted flows | `npm run test` | Tests cover retriable classes (network/429/5xx) and non-retriable classes consistently across touched flows; bounded retries enforced | `tests/*.test.ts` |
| Recovery overlap/dedupe reviewer-traceable test naming | `npm run test` | Recovery overlap/dedupe tests use explicit scenario naming (overlap precedence, endIndex guard, dedupe key) to aid review traceability | `tests/*.test.ts` |
| No regression in static quality + type/spec checks | `npm run lint` | Lint + type + spec-lint all pass | `scripts/spec-lint.ts`, `tsconfig`, `package.json#lint` |
| Coverage floors maintained | `npm run gate:coverage` and `npm run gate:changed-lines` | Global/changed-lines thresholds pass | `scripts/gates/coverage-check.ts`, `scripts/gates/changed-lines-coverage-check.ts` |
| Traceability and anti-gaming invariants maintained | `npm run gate:traceability`, `npm run gate:anti-gaming` | All checks pass with no unmapped touched requirements or gaming violations | `scripts/gates/traceability-check.ts`, `scripts/gates/anti-gaming-check.ts` |
| Full deterministic pre-review gate | `npm run gate:all` | Aggregate verdict PASS | `scripts/gates/gate-all.ts` + `.ai/log/plan/verification-gates-report-<wave>.json` |
