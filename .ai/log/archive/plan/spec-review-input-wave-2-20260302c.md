Wave 2 scope:
- Replace mock Bonfires client wiring with hosted API adapter.
- Retrieval endpoint: POST /delve
- Capture endpoint: POST /agents/{agent_id}/stack/add
- Processing endpoint: POST /agents/{agent_id}/stack/process
- Auth: Authorization Bearer DELVE_API_KEY
- Base URL default: https://tnt-v2.api.bonfires.ai/
- Keep fail-open hook behavior and normalized client contract.
- Out of scope: full ingestion cron/hash ledger implementation.

Artifacts:
- .ai/spec/spec/post-mvp/hosted-api-wiring.md
- .ai/spec/guidance/post-mvp/guidance-for-hosted-api-wiring.md
- .ai/spec/spec/plugin/spec-for-bonfires-client-interface.md
- .ai/log/plan/verification-matrix-wave-2.md
