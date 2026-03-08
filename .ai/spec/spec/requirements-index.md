# Requirements Index

Authoritative index for all requirements and their spec/guidance locations.

## Retrieval

### R1 — before_agent_start (per-turn context injection)
- Spec: `retrieval/before-agent-start.md`
- Guidance: `../../guidance/retrieval/guidance-for-before-agent-start.md`

### R2 — bonfires_search tool
- Spec: `retrieval/bonfires-search-tool.md`
- Guidance: `../../guidance/retrieval/guidance-for-bonfires-search-tool.md`

## Capture

### R3 — agent_end capture (legacy)
- **Superseded by PM10.**
- Spec: `capture/agent-end-capture-legacy.md`
- Guidance: `../../guidance/capture/guidance-for-agent-end-capture.md`

### PM8 — Watermark reset on transcript truncation
- **Retained as guard within PM10.**
- Spec: `capture/watermark-reset-on-truncation.md`
- Guidance: `../../guidance/capture/guidance-for-watermark-reset-on-truncation.md`

### PM9 — prependContext stripping from captured messages
- **Retained within PM11.**
- Spec: `capture/prepend-context-stripping.md`
- Guidance: `../../guidance/capture/guidance-for-prepend-context-stripping.md`

### PM10 — Immediate stack capture (architecture simplification)
- **Active.** Supersedes PM1 (throttled capture), PM7 (compaction flush).
- Spec: `capture/immediate-stack-capture.md`

### PM11 — Capture message sanitization
- **Active.**
- Spec: `capture/message-sanitization.md`
- Guidance: `../../guidance/capture/guidance-for-message-sanitization.md`

### PM12 — Stack search tool + session improvements
- **Active.**
- Spec: `capture/session-improvements.md`

### PM13 — Agent display names in stack messages
- **Active.**
- Spec: `capture/agent-display-names.md`

## Processing

### R4 — Recovery catch-up + session-end flush
- Spec: `processing/recovery-and-session-end.md`
- Guidance: `../../guidance/processing/guidance-for-recovery-and-session-end.md`

### PM2 — Stack processing heartbeat
- Spec: `processing/stack-processing-heartbeat.md`
- Guidance: `../../guidance/processing/guidance-for-stack-processing-heartbeat.md`

### PM7 — Compaction flush (before_compaction hook)
- **Superseded by PM10.** Simplified to processStack + watermark reset.
- Spec: `processing/compaction-flush.md`
- Guidance: `../../guidance/processing/guidance-for-compaction-flush.md`

## Ingestion

### PM4 — Ingestion cron + hash ledger
- Spec: `ingestion/ingestion-cron-and-hash-ledger.md`
- Guidance: `../../guidance/ingestion/guidance-for-ingestion-cron-and-hash-ledger.md`

### PM6 — Ingestion target profiles + agent mapping
- Spec: `ingestion/ingestion-profiles-and-agent-mapping.md`
- Guidance: `../../guidance/ingestion/guidance-for-ingestion-profiles-and-agent-mapping.md`

### PM14 — PDF ingestion routing (Phase A)
- **Active.** Adds extension-routed PDF upload lane via Bonfires `/ingest_pdf` with no new required config keys.
- Spec: `ingestion/pdf-ingestion-routing.md`
- Guidance: `../../guidance/ingestion/guidance-for-pdf-ingestion-routing.md`

### PM15 — Linked content ingestion (Phase B)
- **Active (implementation/remediation).** Per-link explicit confirmation for user-provided links; routes approved links via shared ingestion core.
- Includes deterministic app-layer redirect-hop enforcement and tolerant duplicate-message no-op semantics.
- Spec: `ingestion/linked-content-ingestion.md`
- Guidance: `../../guidance/ingestion/guidance-for-linked-content-ingestion.md`

### PM16 — Approval-gated multi-link ingestion (1C-A)
- **Planned.** Adds bounded `urls[]` ingestion with approval-bound scope and per-link result summaries.
- Spec: `ingestion/approval-gated-link-ingestion-and-discovery.md`
- Guidance: `../../guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`

### PM17 — Discovery + selected-set approval flow (1C-B)
- **Planned / feature-flagged.** Adds generic `discover_links` with approve-selected-set-once handoff to Bonfires ingestion.
- Spec: `ingestion/approval-gated-link-ingestion-and-discovery.md`
- Guidance: `../../guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`

## Client

### R6 — Bonfires client interface
- Spec: `client/bonfires-client-interface.md`
- Guidance: `../../guidance/retrieval/guidance-for-bonfires-search-tool.md`

### PM1 — Hosted API wiring
- Spec: `client/hosted-api-wiring.md`
- Guidance: `../../guidance/client/guidance-for-hosted-api-wiring.md`

### PM3 — Hosted integration verification
- Spec: `client/hosted-integration-verification.md`
- Guidance: `../../guidance/client/guidance-for-hosted-integration-verification.md`

## Config

### R5 — Plugin config + agent mapping
- Spec: `config/plugin-config-and-agent-mapping.md`
- Guidance: `../../guidance/config/guidance-for-plugin-config-and-agent-mapping.md`

### PM5 — Plugin packaging + OpenClaw integration
- Spec: `config/plugin-packaging.md`
- Guidance: `../../guidance/config/guidance-for-plugin-packaging.md`
