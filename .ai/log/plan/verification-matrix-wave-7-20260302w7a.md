# Verification Matrix — Wave 7 (20260302w7a)

| Requirement / Criterion | Gate / Check command | Pass threshold | Implementing artifact |
|---|---|---|---|
| PM5-R1 manifest + package discoverability | `openclaw plugins doctor` (local install/link test) | Plugin discoverable, schema-valid, no manifest/schema errors | `openclaw.plugin.json`, `package.json` |
| PM5-R2 env-friendly config fallbacks | `npm run test` | Config parsing tests cover env fallback precedence for `baseUrl`, `apiKeyEnv`, `bonfireId` | `src/config.ts`, wave-7 config tests |
| PM5-R3 heartbeat distinction docs | `npm run test` (doc lint checks where applicable) + manual review checklist | Docs contain explicit naming collision note + boundaries | `README.md` + relevant spec/guidance docs |
| PM5-R4 runtime state persistence policy | `npm run test` + `npm run gate:all` | State path defaults and overrides covered; no regressions | `src/*` runtime path wiring + tests |
| PM5-R5 lifecycle-managed loops | `npm run test` + `npm run gate:all` | Start/stop behavior deterministic in tests; no duplicate loop regressions | plugin register/service wiring |
| PM5-R6 install/operator usability docs | manual doc pass + `openclaw plugins doctor` | Install + config + troubleshooting sections present and coherent | `README.md` |
| No deterministic regression | `npm run gate:all` | PASS | gate suite |
