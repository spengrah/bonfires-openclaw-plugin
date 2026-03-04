# Verification Matrix — Wave 4 (20260302w4a)

| Requirement / Criterion | Gate command(s) | Pass threshold | Implementing artifact |
|---|---|---|---|
| Quality gate reports module-level evidence for touched critical modules | `npm run gate:quality` | Output includes touched module + matched tests by intent class | `scripts/gates/quality-check.ts` |
| Quality evidence artifact is produced for current run | `npm run gate:quality` | `.ai/log/plan/quality-gate-evidence-current.json` is written and parseable JSON | `scripts/gates/quality-check.ts` |
| Existing quality gate semantics preserved | `npm run gate:quality` | Missing happy/negative/edge signals still FAIL the gate | `scripts/gates/quality-check.ts` |
| Full deterministic gate suite remains healthy | `npm run gate:all` | Aggregate verdict PASS | `scripts/gates/gate-all.ts` |
