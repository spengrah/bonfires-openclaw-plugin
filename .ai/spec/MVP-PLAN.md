# Bonfires Plugin MVP Plan

## Scope decisions (confirmed)
1. MVP includes plugin hooks + tool.
2. MVP also includes the recovery/catch-up path (scheduled JSONL backfill tick).
3. Content ingestion cron remains Phase 2.
4. Keep standalone repo; defer symlink setup.
5. Spec both `lyle` and `reviewer` Bonfires agent mappings.
6. Use strict per-turn retrieval first (no cache/throttle in MVP).
7. Implement with mocked Bonfires client first, then wire hosted API.

## Clarification: heartbeat/catch-up
"Heartbeat/catch-up" means a fallback path that periodically scans persisted session transcript JSONL files and backfills anything that might have been missed by `agent_end` (e.g., crash/restart gaps or pre-plugin sessions). It is **not** primary capture, but it is now included in MVP as a reliability safety net.

## Goals
- Deterministic per-turn memory retrieval via `before_agent_start`.
- Explicit tool-based retrieval via `bonfires_search`.
- Deterministic episodic capture via `agent_end` with per-session throttling ledger.
- Reliable recovery path via heartbeat transcript scan backfill.

## Non-goals (MVP)
- Ingestion cron/script and hash ledger.
- Production latency optimization/caching.

## Wave plan

### Wave 0 — Baseline gates (must pass before implementation)
- Replace placeholder commands in `.ai/pre-commit.json` with real lint/test commands.
- Ensure commands are runnable in this repo.

Pass/fail gates:
- `lint`: command exits 0.
- `test`: command exits 0.

### Wave 1 — Plugin skeleton + mocked client
- Add `package.json`, `index.ts`, `bonfires-client.ts`.
- Register hooks: `before_agent_start`, `agent_end`.
- Register tool: `bonfires_search(query, limit?)`.
- Add config schema and mapping for agents: `lyle`, `reviewer`.
- Implement in-memory per-session capture watermark map.

Pass/fail gates:
- Type/lint passes.
- Unit tests for hook behavior and tool response shape pass.
- Hook errors are swallowed and do not crash plugin.

### Wave 2 — Real API wiring (toggle from mocks)
- Wire actual Bonfires endpoints behind client interface.
- Add env-based API key loading.
- Keep formatting contract for `prependContext` stable.

Pass/fail gates:
- Integration tests with mocked HTTP server pass.
- Manual dry-run: context injection visible on a test prompt.
- `agent_end` capture called no more than once per throttle window per session.

### Wave 3 — Recovery path + session-end flush policy
- Add scheduled catch-up scan of persisted session JSONL transcripts (heartbeat flow and/or cron cadence).
- Persist/reuse capture watermark ledger across `agent_end` and catch-up paths.
- Add explicit "session-end flush" behavior:
  - If a `session_end` hook exists, force a final capture on session close.
  - If no `session_end` hook exists, emulate close with inactivity timeout and run final flush on next heartbeat tick.

Pass/fail gates:
- Simulated missed `agent_end` messages are recovered by catch-up.
- No duplicate pushes when both `agent_end` and catch-up observe the same range.
- Final session slice is captured on close (real hook or inactivity fallback).

## Verification matrix
1. Per-turn retrieval happens each turn
   - Check: invoke `before_agent_start` twice with different prompts
   - Pass: two search calls with corresponding query values

2. Tool returns deterministic shape
   - Check: call `bonfires_search("x", 3)`
   - Pass: `{results:[{summary,source,score}]}` schema-compliant

3. Episodic throttle works per session
   - Check: consecutive `agent_end` within throttle window
   - Pass: first capture call only; second skipped

4. Multi-agent mapping present
   - Check: config includes `lyle` and `reviewer`
   - Pass: lookup resolves both; unknown agent handled gracefully

## Open blockers
- Confirm exact hosted Bonfires search and capture endpoint payloads.
- Confirm hosted support for distinct Bonfires agent IDs for `lyle` and `reviewer`.

## Spec format
This plan is now decomposed into feature specs + guidance docs under:
- `.ai/spec/spec/plugin/*.md`
- `.ai/spec/guidance/plugin/*.md`
- `.ai/spec/spec/quality/*.md`
- `.ai/spec/guidance/quality/*.md`

Use `.ai/spec/spec/plugin/requirements-index.md` as the canonical index.

## Immediate next action
- Implement Wave 0 (replace placeholder lint/test commands) and start Wave 1 scaffolding.
