# Verification Matrix — Wave 8 (20260303w8a)

| Requirement / Criterion | Gate command(s) | Pass threshold | Implementing artifact |
|---|---|---|---|
| PM6-R1 profile config model | `npm run test` | parsing/validation tests pass for profiles/include/exclude/extensions | `src/config.ts`, new wave8 tests |
| PM6-R2 agent->profile mapping | `npm run test` | deterministic mapping + explicit failure tests pass | `src/ingestion.ts`, new wave8 tests |
| PM6-R3 legacy migration path | `npm run test` | legacy config normalizes to synthetic profile and emits deprecation warning path | `src/config.ts`, new wave8 tests |
| PM6-R4 safety defaults | `npm run test` | exclude/extension tests pass; dedupe behavior unchanged | `src/ingestion.ts`, existing + new tests |
| PM6-R5 operability/docs | `npm run test` + doc assertions | summary includes profile/agent dimensions; README examples updated | `README.md`, ingestion summary schema/tests |
| Regression safety | `npm run gate:all` | PASS | gate suite |
