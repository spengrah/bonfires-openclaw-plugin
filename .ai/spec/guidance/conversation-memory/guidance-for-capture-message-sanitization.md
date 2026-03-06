# Guidance: Capture Message Sanitization (PM11)

## Reviewer checklist

1. **userId resolution**
   - User messages: userId derived from `Sender (untrusted metadata)` JSON block, not hardcoded `"user"`
   - Assistant messages: userId is an agent identifier, not `"assistant"`
   - Fallback to role name if metadata parsing fails (fail-open)

2. **Strip ordering**
   - prependContext stripped BEFORE metadata wrapper (prependContext precedes metadata in stored message)
   - `extractUserMessage()` applied AFTER `stripPrependContext()`

3. **Metadata extraction is best-effort**
   - Regex/JSON parsing failure must not break capture
   - Missing metadata → fallback to role name
   - Malformed JSON in metadata block → skip, use fallback

4. **No extra fields in stack/add payload**
   - Bonfires API expects: `text`, `userId`, `chatId`, `timestamp`
   - Remove `role` and `content` fields that aren't in the API spec

5. **extractUserMessage scope**
   - Previously only used in `before_agent_start` (search queries)
   - Now also used in `toStackMsg` (capture path)
   - Function is pure, stateless — safe to reuse

6. **Test coverage**
   - toStackMsg produces clean text for metadata-wrapped user messages
   - userId is extracted from metadata when available
   - userId falls back gracefully when metadata is missing
   - Assistant userId uses agent identifier
   - Paired messages have correct userIds for both speakers
