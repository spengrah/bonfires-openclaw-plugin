# bonfires-openclaw-plugin

Bonfires integration plugin for OpenClaw.

## Overview
`bonfires-openclaw-plugin` connects OpenClaw agents to Bonfires memory so agents can retrieve and persist useful context during conversations.

The plugin is intended to improve continuity and recall by combining:
1. **Pre-turn retrieval** of relevant memory context.
2. **On-demand search** via an agent tool.
3. **Post-turn capture** of episodic conversation slices.

## Intent
This plugin exists to make OpenClaw sessions more context-aware without requiring manual copy/paste memory workflows.

Design intent:
- Keep retrieval deterministic and bounded.
- Keep capture reliable and non-disruptive.
- Degrade gracefully (fail-open) when memory systems are unavailable.
- Preserve clear spec/guidance/verification artifacts in-repo.

## Core features
- Hook-based retrieval before agent turns (`before_agent_start`)
- Hook-based episodic capture after turns (`agent_end`)
- Session-end integration point (`session_end`)
- Stack-processing heartbeat runner (20-minute base cadence + jitter) with bounded retries
- Recovery/catch-up flow sharing capture watermark semantics with overlap-safe dedupe guards
- Hosted strict-mode guard to prevent silent mock fallback in non-dev hosted contexts
- Agent tool: `bonfires_search(query, limit?)`
- Agent mapping support for arbitrary agent IDs (project-specific names)
- Capture ledger for per-session throttling and incremental push behavior

## How to work with this repo
## Repository layout
- `src/` — plugin code
- `tests/` — automated tests
- `.ai/spec/` — feature specs and implementation guidance
- `.ai/log/` — planning/review/readiness artifacts
- `scripts/` — local verification/gate scripts

## Local commands
```bash
npm run lint
npm run test
npm run gate:all
npm run verify:hosted        # fixture-mode contract verification + artifact
npm run verify:hosted -- --live  # adds live preflight probes (requires env)
npm run ingest:bonfires      # run ingestion scan + hash-ledger update once
```

### Hosted verification output
- Report path: `.ai/log/plan/hosted-integration-verification-current.json`
- Report includes per-probe status and redacted config metadata (never prints API key values).

### Ingestion cron output
- Ledger path (default): `.ai/log/plan/ingestion-hash-ledger.json`
- Run summary path (default): `.ai/log/plan/ingestion-cron-summary-current.json`
- Ingestion is idempotent by content hash (`sha256:*`) and restart-safe via persisted ledger.

## Typical workflow
1. Update specs/guidance under `.ai/spec/` when behavior changes.
2. Implement changes in `src/`.
3. Add/adjust tests in `tests/` and requirement mapping docs as needed.
4. Run lint/tests locally.
5. Record review artifacts under `.ai/log/review/`.

## Notes
- `.ai/log/` is intentionally tracked for workflow provenance.
- Keep secrets out of repo and out of memory/log artifacts.
