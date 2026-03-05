# Bonfires Plugin MVP Plan

## Status

Waves 0–3 complete. Plugin deployed and dogfood-tested against hosted Bonfires API (2026-03-05). Ingestion cron deferred to Phase 2.

## Scope decisions (confirmed)
1. MVP includes plugin hooks + tool.
2. MVP also includes the recovery/catch-up path (scheduled JSONL backfill tick).
3. Content ingestion cron remains Phase 2.
4. Keep standalone repo; defer symlink setup.
5. Both `lyle` and `reviewer` share the same Bonfires agent ID (`69a51b279c462f4f06abe2f5`).
6. Use strict per-turn retrieval first (no cache/throttle in MVP).
7. Implement with mocked Bonfires client first, then wire hosted API.

## Goals
- Deterministic per-turn memory retrieval via `before_agent_start`.
- Explicit tool-based retrieval via `bonfires_search`.
- Deterministic episodic capture via `agent_end` with per-session throttling ledger.
- Reliable recovery path via heartbeat transcript scan backfill.

## Non-goals (MVP)
- Ingestion cron/script and hash ledger.
- Production latency optimization/caching.

## Wave plan

### Wave 0 — Baseline gates ✅
- Replace placeholder commands in `.ai/pre-commit.json` with real lint/test commands.

### Wave 1 — Plugin skeleton + mocked client ✅
- Plugin structure, hooks, tool, config parsing, capture ledger.
- 149 unit tests passing.

### Wave 2 — Real API wiring ✅
- Hosted Bonfires client with retry logic.
- `/delve` search, `/agents/{id}/stack/add` capture, `/agents/{id}/stack/process`, `/ingest_content`.
- JSON episode content parsing, newline stripping, content array normalization.

### Wave 3 — Recovery path + session-end flush ✅
- Scheduled recovery tick via heartbeat.
- Session-end flush with inactivity timeout.
- Heartbeat state persistence.

## Dogfood findings (2026-03-05)

Key issues discovered and resolved during live testing:

1. **Agent ID must be MongoDB ObjectId**, not username string. Username → 403.
2. **stack/add requires `text`, `userId`, `chatId`** — Telegram-style schema, not `{role, content}`.
3. **Assistant messages have array content** — `[{type:"text", text:"..."}, {type:"tool_use", ...}]`. Client extracts text blocks only.
4. **Paired messages recommended** — `{messages: [...], is_paired: true}` produces better episodes than one-at-a-time.
5. **Episode content is JSON** — `/delve` returns `content: '{"name":"...", "content":"...", "updates":[]}'`. Client now parses inner `content` field.
6. **State directory ambiguity** — `api.resolvePath` resolves differently depending on cwd. Fixed with explicit absolute `stateDir` in config.
7. **Vector store pipeline** — `/ingest_content` writes to MongoDB, not Weaviate directly. Vectorization is a separate Bonfires-side daily workflow.

## Open items
- Episode extraction still producing some empty `{"updates": []}` episodes — awaiting paired format results and Bonfires team feedback.
- Vector store not yet populated (requires Bonfires admin action).
- Per-turn search latency not yet measured under production load.

## Immediate next action
- Confirm paired message format resolves empty episodes.
- Coordinate with Bonfires team on vector store population pipeline.
