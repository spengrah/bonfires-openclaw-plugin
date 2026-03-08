# Guidance: Capture Message Sanitization (PM11)

## Reviewer checklist

### 1. User message cleaning

- [ ] `stripPrependContext` applied FIRST (it precedes metadata in the stored message)
- [ ] `extractSenderFromMetadata` called BEFORE `extractUserMessage` strips the wrapper
- [ ] `extractUserMessage` applied LAST to get clean text
- [ ] All three steps are fail-open: bad input -> fallback, never throw

### 2. Assistant message cleaning

- [ ] Only `type === "text"` content blocks are kept
- [ ] `thinking` blocks are stripped (contain encrypted reasoning signatures)
- [ ] `toolCall` blocks are stripped (contain tool invocation JSON)
- [ ] `[[reply_to_current]]` prefix stripped from text blocks
- [ ] Assistant turns with zero text blocks produce null (skipped entirely)

### 3. userId resolution

- [ ] User messages: extracted from `Sender (untrusted metadata)` JSON block
- [ ] Preference order: `name` > `username` > `id` > fallback `"user"`
- [ ] Assistant messages: Bonfires agent ID from capture request (not hardcoded `"assistant"`)
- [ ] Malformed/missing metadata -> graceful fallback, no throw

### 4. stack/add payload shape

- [ ] Each message has exactly six fields: `text`, `userId`, `chatId`, `timestamp`, `role`, `username`
- [ ] No extra fields beyond the six-field contract (`content`, etc.)
- [ ] `chatId` is `ctx.sessionId ?? ctx.sessionKey`
- [ ] `timestamp` is ISO-8601

### 5. extractUserMessage reuse

- [ ] Function lives in shared `message-utils.ts`
- [ ] Imported into both `hooks.ts` and `bonfires-client.ts` (no hook/client coupling)
- [ ] Same function used for both search query extraction (before_agent_start) and capture cleaning (toStackMsg)

### 6. Test coverage

- [ ] User message: full pipeline (prependContext + metadata + clean text)
- [ ] User message: metadata-only (no prependContext)
- [ ] User message: plain text (no metadata, no prependContext)
- [ ] User message: sender name extracted correctly
- [ ] User message: sender fallback when metadata missing/malformed
- [ ] Assistant message: text blocks extracted, thinking/toolCall stripped
- [ ] Assistant message: `[[reply_to_current]]` stripped
- [ ] Assistant message: pure tool call turn -> null (skipped)
- [ ] Assistant message: plain string content (not array) -> pass through
- [ ] userId for assistant uses agent ID, not "assistant"
- [ ] Paired messages have correct userIds for both speakers
- [ ] Empty text after cleaning -> message skipped (null)

### 7. Common mistakes to watch for

- Stripping metadata BEFORE extracting sender (loses userId info)
- Applying `extractUserMessage` to assistant messages (only for user)
- Hardcoding userId instead of resolving from metadata/config
- Not handling content as both string and array (OpenClaw uses both)
- Forgetting that `[[reply_to_current]]` may not be present on all text blocks
