# Guidance: Context-Aware Recall (PM12)

## Reviewer checklist

### 1. First-message-only injection

- [ ] `before_agent_start` checks `ctx.sessionId` against `ledger.hasInjected()`
- [ ] First message: searches `/delve` and returns prependContext
- [ ] Subsequent messages (same sessionId): returns `undefined` without searching
- [ ] New sessionId: re-enables injection
- [ ] Session marked as injected AFTER successful search (not before)
- [ ] Search error does NOT mark session as injected (allows retry)
- [ ] Empty search results still marks session as injected

### 2. Backward compatibility

- [ ] Missing `sessionId` in ctx: always injects (no tracking, pre-PM12 behavior)
- [ ] Missing `ledger` in deps: always injects (optional chaining on `deps.ledger?.`)
- [ ] Existing tests that don't pass sessionId/ledger still pass

### 3. chatId change

- [ ] `capture()` accepts optional `sessionId` parameter
- [ ] `chatId` in stack messages = `sessionId` when present, falls back to `sessionKey`
- [ ] Watermark ledger still keyed by `sessionKey` (not sessionId)
- [ ] `handleAgentEnd` passes `ctx.sessionId` to capture
- [ ] `handleSessionEnd` passes `ctx.sessionId` to capture
- [ ] Recovery tick (heartbeat) works without sessionId (fallback to sessionKey)

### 4. Stack message enrichment

- [ ] `toStackMsg` returns 6 fields: text, userId, chatId, timestamp, role, username
- [ ] User messages: role="user", username=sender name from metadata
- [ ] Assistant messages: role="assistant", username=agent ID
- [ ] Existing field values (text, userId, chatId, timestamp) unchanged in behavior

### 5. /delve agent_id

- [ ] `search()` passes `agent_id: req.agentId` in request body
- [ ] Existing search behavior unaffected (agent_id is additive)

### 6. Stack search tool

- [ ] `bonfiresStackSearchTool` validates query (string, required)
- [ ] Limit clamped to 1-100, defaults to 10
- [ ] Unknown agent returns empty `{ results: [], count: 0, query }`
- [ ] `HostedBonfiresClient.stackSearch` hits `POST /agents/{id}/stack/search`
- [ ] Tool registered in `index.ts` with descriptive name and description

### 7. Injection tracker

- [ ] `InMemoryCaptureLedger` has `hasInjected()` and `markInjected()` methods
- [ ] Tracking is in-memory only (Set<string>), not persisted to disk
- [ ] Plugin restart clears tracker (fresh sessions)

### 8. Debug log removal

- [ ] `/tmp/bonfires-debug.log` write removed from `capture()` method
- [ ] No other debug logging left in production code

### 9. Test coverage

- [ ] First-message injection with sessionId
- [ ] Subsequent message skip with same sessionId
- [ ] Re-injection on new sessionId
- [ ] Backward compat without sessionId
- [ ] Backward compat without ledger
- [ ] Empty search results still mark injected
- [ ] Search error does not mark injected
- [ ] sessionId passed through agent_end/session_end to capture
- [ ] chatId uses sessionId when provided
- [ ] chatId falls back to sessionKey when sessionId absent
- [ ] role and username in stack messages
- [ ] agent_id passed to /delve
- [ ] Stack search tool validates, clamps, returns
- [ ] Hosted stackSearch endpoint and response
- [ ] Ledger injection tracking in-memory only
- [ ] Plugin registers two tools
