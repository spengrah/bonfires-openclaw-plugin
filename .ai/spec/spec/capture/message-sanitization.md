# Spec: Capture Message Sanitization

**ID:** PM11
**Status:** Draft
**Depends on:** PM9 (prependContext stripping), PM10 (immediate stack capture)

## Problem

Messages sent to Bonfires via `stack/add` contain OpenClaw-specific artifacts that pollute the knowledge graph and likely cause empty episode extraction. Both user and assistant messages need cleaning.

## Bonfires stack/add message format

Per the current Bonfires stack payload contract in this plugin, each message includes six fields:

```json
{
  "text": "actual message content",
  "userId": "speaker-identifier",
  "chatId": "conversation-identifier",
  "timestamp": "ISO-8601",
  "role": "user|assistant",
  "username": "display-name"
}
```

## Raw OpenClaw message formats

### User messages

Content is an array of blocks: `[{type: "text", text: "..."}]`

The text contains, in order:

1. **prependContext injection** (from our plugin's `before_agent_start`):
   ```
   --- Bonfires context ---
   - memory 1 (source: ..., relevance: ...)
   ---
   ```

2. **OpenClaw metadata wrappers**:
   ```
   Conversation info (untrusted metadata):
   ```json
   {"message_id": "...", "sender_id": "@user:matrix.org", "sender": "Spencer", ...}
   ```

   Sender (untrusted metadata):
   ```json
   {"name": "Spencer", "id": "@spengrah:matrix.org", "username": "spengrah"}
   ```
   ```

3. **Actual user message** — the only part Bonfires should see.

### Assistant messages

Content is an array of blocks with mixed types:

- `{type: "thinking", ...}` — internal reasoning with encrypted signatures. **Must strip.**
- `{type: "toolCall", ...}` — tool invocations. **Must strip.**
- `{type: "text", text: "[[reply_to_current]]actual response"}` — the real response. **Keep, but strip `[[reply_to_current]]` prefix.**

Many assistant turns have no text blocks (pure tool calls). These should produce no stack message.

## Design

### User message cleaning pipeline

```
1. extractText(m)               -> join text-type blocks from content array
2. stripPrependContext(text)     -> remove "--- Bonfires context ---" prefix
3. extractSenderFromMeta(text)   -> parse Sender metadata block -> userId
4. extractUserMessage(text)      -> strip metadata wrappers -> clean text
```

### Assistant message cleaning pipeline

```
1. Filter content blocks to type === "text" only
2. For each text block, strip "[[reply_to_current]]" prefix
3. Join remaining text
4. If empty after filtering, return null (skip message)
```

### Field population

| Field | User messages | Assistant messages |
|-------|--------------|-------------------|
| `text` | Clean message (prependContext + metadata stripped) | Clean response (thinking + toolCalls stripped, `[[reply_to_current]]` stripped) |
| `userId` | Sender `name` from metadata, fallback `"user"` | Resolved assistant display name (fallback agent id) |
| `chatId` | `ctx.sessionId ?? ctx.sessionKey` | `ctx.sessionId ?? ctx.sessionKey` |
| `timestamp` | `new Date().toISOString()` | `new Date().toISOString()` |
| `role` | `"user"` | `"assistant"` |
| `username` | same as resolved user `userId` | same as resolved assistant `userId` |

### New functions

**`extractSenderFromMetadata(text: string): string | null`**
- Parses the `Sender (untrusted metadata)` JSON block via regex
- Returns `name`, falling back to `username`, then `id`, then null
- Must not throw on malformed input

**`extractAssistantText(m: {role: string, content: any}): string`**
- Filters content array to `type === "text"` blocks only
- Strips `[[reply_to_current]]` prefix from each block
- Joins with newline
- Returns empty string if no text blocks

### Changes to existing code

**`toStackMsg`** in `bonfires-client.ts`:
- User messages: apply full cleaning pipeline (stripPrependContext -> extractSender -> extractUserMessage)
- Assistant messages: use `extractAssistantText` instead of `extractText`
- Set `userId` to resolved identity, not `m.role`
- Return six fields: `text`, `userId`, `chatId`, `timestamp`, `role`, `username`
- Return null if cleaned text is empty

**Import `extractUserMessage`** from `message-utils.ts` into both `hooks.ts` and `bonfires-client.ts` (shared utility, no hook/client boundary coupling).

## Acceptance criteria

- User messages sent to `stack/add` contain only the actual user message text
- Assistant messages contain only the text response, no thinking/toolCall artifacts
- `[[reply_to_current]]` prefix is stripped from assistant text
- `userId` is the sender's name (from metadata) for users, Bonfires agent ID for assistant
- Stack message payload includes six fields: `text`, `userId`, `chatId`, `timestamp`, `role`, `username`
- Messages with no extractable text (pure tool calls) are skipped
- All extraction is fail-open: malformed input -> fallback, never throw
- Existing tests updated, no regressions
