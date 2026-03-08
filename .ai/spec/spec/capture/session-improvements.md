# Spec: Stack Search Tool and Session Improvements

**ID:** PM12
**Status:** Implemented
**Depends on:** PM10 (immediate stack capture), PM11 (capture message sanitization)

## Changes

### 1. `bonfires_stack_search` tool
Adds a second tool that searches recent unprocessed stack messages via `POST /agents/{agentId}/stack/search`. Complements `bonfires_search` (which searches the processed knowledge graph).

### 2. First-message-only injection
`before_agent_start` now only injects Bonfires context on the first message of each session. Injection tracking uses the capture ledger (`hasInjected`/`markInjected` by sessionId) and persists across restarts when a ledger path is configured.

### 3. `sessionId` as `chatId`
Stack messages use `ctx.sessionId` as `chatId` (more stable identifier), falling back to `ctx.sessionKey`.

## Acceptance criteria
- `bonfires_stack_search` tool registered alongside `bonfires_search`
- Second message in same session does not trigger Bonfires search injection
- First-message injection state persists across process restarts when ledger persistence is enabled
- Stack messages use sessionId as chatId when available
