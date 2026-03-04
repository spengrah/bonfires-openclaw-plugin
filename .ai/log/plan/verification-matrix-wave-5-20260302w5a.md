# Verification Matrix — Wave 5 (20260302w5a)

| Requirement / Criterion | Gate command(s) | Pass threshold | Implementing artifact |
|---|---|---|---|
| PM3 preflight probes are implemented (healthz + generate_summaries) | `npm run verify:hosted -- --live` (env-dependent) and `npm run verify:hosted` (fixture proof) | Probe entries exist in report with explicit statuses | `scripts/hosted-integration-verify.ts` |
| PM3 contract probes cover `/delve`, `/stack/add`, `/stack/process` handling | `npm run verify:hosted` | Fixture contract probes PASS and appear in artifact | `scripts/hosted-integration-verify.ts` |
| Verification artifact is written under `.ai/log/plan/` | `npm run verify:hosted` | `.ai/log/plan/hosted-integration-verification-current.json` exists + parseable | `scripts/hosted-integration-verify.ts` |
| Secret redaction policy holds | `npm run test` | Redaction tests pass and artifact excludes raw keys | `tests/wave5-hosted-verification.test.ts` |
| No regression in deterministic suite | `npm run gate:all` | PASS | `scripts/gates/gate-all.ts` |
