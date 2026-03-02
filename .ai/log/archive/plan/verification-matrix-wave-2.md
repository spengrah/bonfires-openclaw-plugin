# Verification Matrix — Wave 2 (Hosted API Wiring)

| Criterion | Gate/Check | Pass Threshold | Artifact |
|---|---|---|---|
| Preflight connectivity | `GET /healthz` | HTTP 200 | `.ai/log/plan/wave-2-preflight.json` |
| Auth + bonfire access | `POST /generate_summaries` | HTTP 200 + `status=started` | `.ai/log/plan/wave-2-preflight.json` |
| Retrieval wiring | before_agent_start uses `/delve` | Integration test pass | `tests/wave2-hosted.test.ts` |
| Capture wiring | agent_end uses `/agents/{agent_id}/stack/add` | Integration test pass | `tests/wave2-hosted.test.ts` |
| Processing trigger path | heartbeat/process adapter callable | Integration test pass | `tests/wave2-hosted.test.ts` |
| Normalized contracts | Search/Capture adapter shapes stable | spec-test + tests pass | `npm run test` |
| Safety behavior | Hook fail-open on HTTP errors | tests pass | `tests/wave2-hosted.test.ts` |
