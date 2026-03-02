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
- Agent tool: `bonfires_search(query, limit?)`
- Agent mapping support (e.g. `lyle`, `reviewer`)
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
```

## Typical workflow
1. Update specs/guidance under `.ai/spec/` when behavior changes.
2. Implement changes in `src/`.
3. Add/adjust tests in `tests/` and requirement mapping docs as needed.
4. Run lint/tests locally.
5. Record review artifacts under `.ai/log/review/`.

## Notes
- `.ai/log/` is intentionally tracked for workflow provenance.
- Keep secrets out of repo and out of memory/log artifacts.
