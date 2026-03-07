# Spec: Context-Aware Recall

**ID:** PM12
**Status:** Implemented
**Depends on:** PM10 (immediate stack capture), PM11 (message sanitization), PM9 (prependContext stripping)

## Problem

Auto-injecting `/delve` search results on every user message causes:
1. **Redundancy**: Episodes created from the current session's messages get injected back into the same session, duplicating content already in the LLM context window.
2. **Irrelevance**: Every message triggers a `/delve` query, even when the agent doesn't need external context.

## Design

### Hybrid recall strategy

| Scenario | Mechanism | Why |
|----------|-----------|-----|
| First message of session | Auto-inject via `before_agent_start` | Prime the agent with history. No current-session episodes exist yet. |
| Subsequent messages | Agent calls `bonfires_search` tool | Agent decides when it needs context. |

### How "first message" is detected

Track `sessionId`s that have received injection in an in-memory `Set<string>` on the capture ledger. `ctx.sessionId` (session UUID) changes on session reset (idle timeout, compaction, daily reset). No persistence needed — plugin restart means fresh sessions.

### chatId change

`chatId` in `stack/add` messages switched from `ctx.sessionKey` (channel identifier) to `ctx.sessionId` (session UUID). This better represents the LLM session boundary for Bonfires episode grouping. Watermark ledger stays keyed by `sessionKey`.

### Stack message enrichment

`stack/add` messages now include two additional fields:
- `role`: `"user"` or `"assistant"`
- `username`: sender display name (same as userId for now)

### agent_id in /delve

`agent_id` now passed in `/delve` requests, enabling graph state persistence on the Bonfires side.

### New tool: bonfires_stack_search

Wraps `POST /agents/{id}/stack/search` for semantic search within unprocessed stack messages.

## What changed

| Component | Before | After |
|-----------|--------|-------|
| `before_agent_start` | Always queries `/delve` and injects | Only on first message of session |
| Subsequent turns | Auto-injected (redundant) | Agent uses `bonfires_search` tool on demand |
| `chatId` in stack/add | `ctx.sessionKey` (channel ID) | `ctx.sessionId` (session UUID) |
| Stack message fields | 4 fields: text, userId, chatId, timestamp | 6 fields: + role, username |
| `/delve` request | Missing agent_id | Includes agent_id |
| `bonfires_search` tool | Generic description | Descriptive, guides agent usage |
| `bonfires_stack_search` tool | N/A | New tool for unprocessed stack search |
| Debug payload log | Active at /tmp/bonfires-debug.log | Removed |

## What stays the same

- `agent_end` capture (immediate, every turn — PM10)
- Heartbeat `stack/process` (every 20min)
- Message cleaning pipeline (PM11)
- `stripPrependContext` (PM9)
- Watermark ledger keyed by sessionKey
- Paired message format

## Acceptance criteria

- First message of new session: `before_agent_start` queries `/delve` and returns `prependContext`.
- Subsequent messages in same session: `before_agent_start` returns `undefined`.
- Session reset (new sessionId): first message gets injection again.
- `chatId` in stack/add is session UUID, not channel key.
- Stack messages include `role` and `username` fields.
- `agent_id` sent in `/delve` requests.
- `bonfires_stack_search` tool registered and functional.
- Backward compatible: works without sessionId or ledger in deps.
