# bonfires-openclaw-plugin

Bonfires integration plugin for OpenClaw.

## What this repo is for
This project builds an OpenClaw memory plugin that:
1. Retrieves relevant Bonfires context before agent turns.
2. Exposes an explicit `bonfires_search` tool for on-demand retrieval.
3. Captures episodic conversation slices after turns (`agent_end`) with per-session throttling.
4. Supports recovery/catch-up planning and verification artifacts for later waves.

Current status: **Wave 1 baseline implemented (mock client + hooks/tool + ledger + tests)**.

## Wave 1 scope (implemented)
- Plugin skeleton modules under `src/`
- Hook registration:
  - `before_agent_start`
  - `agent_end`
  - `session_end` (stub for forward compatibility)
- Tool registration:
  - `bonfires_search(query, limit?)`
- Config parsing with required Bonfires agent mappings:
  - `lyle`
  - `reviewer`
- In-memory capture ledger with safe persisted-path scaffold
- Deterministic test coverage for core Wave 1 behaviors and edge cases

## Repo structure
- `src/` — plugin runtime code (Wave 1 uses mocked Bonfires client)
- `tests/` — Node test suite + requirement mapping
- `.ai/spec/` — feature specs, guidance docs, quality/traceability docs
- `.ai/log/` — planning/review/readiness artifacts (tracked in git by design)
- `scripts/` — deterministic spec/gate checks

## Commands
```bash
npm run lint
npm run test
```

## Notes
- This repo intentionally tracks `.ai/log/` artifacts as part of workflow provenance.
- Real Bonfires hosted API wiring is a later wave (Wave 2+), after mock-first stabilization.
- Recovery scheduler/catch-up execution is planned beyond Wave 1 implementation scope.
