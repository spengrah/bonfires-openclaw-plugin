# Bonfires Plugin Specs

This folder follows a split-spec model:
- `spec/**` = feature specs (what must be true)
- `guidance/**` = implementation guidance (how to approach it)

Start here:
1. `spec/requirements-index.md` — unified index (R1–R6 + PM1–PM15, grouped by feature)
2. Feature specs organized by component:
   - `spec/retrieval/` — search + context injection (before_agent_start, bonfires_search tool)
   - `spec/capture/` — message capture to stack (immediate capture, sanitization, display names)
   - `spec/processing/` — stack → episodes (heartbeat, recovery, compaction)
   - `spec/ingestion/` — file/doc ingestion (cron, profiles)
   - `spec/client/` — API client (hosted wiring, client interface)
   - `spec/config/` — plugin config + packaging
   - `spec/quality/` — gates, traceability, verification
3. Matching guidance under `guidance/<same-component>/`
