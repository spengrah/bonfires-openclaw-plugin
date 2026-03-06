# Spec: Capture Message Sanitization

**ID:** PM11
**Status:** Draft
**Depends on:** PM9 (prependContext stripping), PM10 (immediate stack capture)

## Problem

Messages sent to Bonfires via `stack/add` contain three quality issues that likely cause empty episode extraction:

### 1. userId is the role name, not an actual identifier

`toStackMsg` sets `userId: m.role`, producing `"user"` or `"assistant"`. Bonfires uses `userId` to distinguish speakers and build the knowledge graph. Generic role names give the extraction pipeline nothing meaningful to work with.

The actual sender identity is available in the OpenClaw metadata wrapper embedded in user messages:
```
Sender (untrusted metadata):
\`\`\`json
{"label": "Spencer (@spengrah:matrix.org)", "id": "@spengrah:matrix.org", "name": "Spencer", "username": "spengrah"}
\`\`\`
```

### 2. Metadata wrappers are not stripped from captured messages

`extractUserMessage()` strips OpenClaw metadata wrappers but is only used in `before_agent_start` for search queries. The capture path in `toStackMsg` sends the full metadata-wrapped content to Bonfires, including:
- `Conversation info (untrusted metadata):` block with JSON
- `Sender (untrusted metadata):` block with JSON
- The actual user message after both blocks

### 3. prependContext and metadata wrapper ordering

The stored user message has this structure:
```
--- Bonfires context ---
- memory 1 ...
---
Conversation info (untrusted metadata):
\`\`\`json
{...}
\`\`\`
Sender (untrusted metadata):
\`\`\`json
{...}
\`\`\`
actual user message
```

`stripPrependContext` (PM9) removes the Bonfires context prefix, but the metadata wrapper remains. Both must be stripped, in order: prependContext first (it precedes the metadata), then metadata wrapper.

## Design

### toStackMsg changes

1. For **user** messages:
   a. Extract text from content blocks (existing `extractText`)
   b. Strip prependContext prefix (existing `stripPrependContext`)
   c. Extract sender metadata from the wrapper before stripping it (new)
   d. Strip metadata wrapper via `extractUserMessage()` (existing function, newly applied here)
   e. Set `userId` to extracted sender name/id, falling back to `"user"`

2. For **assistant** messages:
   a. Extract text (existing)
   b. Set `userId` to the OpenClaw agent identifier from config or context

### Sender metadata extraction

New private method `extractSenderFromMetadata(text: string)` that parses the `Sender (untrusted metadata)` JSON block and returns `{name, id, username}` or null. Called before `extractUserMessage()` strips the wrapper.

### userId resolution

| Role | userId value |
|------|-------------|
| user | Extracted sender `name` or `id` from metadata, fallback `"user"` |
| assistant | Agent name from config or OpenClaw agent ID, fallback `"assistant"` |

### What changes in toStackMsg

```
Before: { text, userId: m.role, chatId, role, content: text, timestamp }
After:  { text: cleaned, userId: resolved, chatId, timestamp }
```

- `text`: prependContext stripped, metadata stripped, clean user message only
- `userId`: actual identifier, not role name
- Remove extra fields (`role`, `content`) not in Bonfires API spec

## Acceptance criteria

- User messages sent to `stack/add` contain only the actual user message (no metadata, no prependContext)
- `userId` for user messages is the sender's name or ID from metadata, not `"user"`
- `userId` for assistant messages is an agent identifier, not `"assistant"`
- `extractUserMessage()` is applied in the capture path, not just search
- Existing tests updated, no regressions
- Production verification: inspect `stack/add` payload, confirm clean message text and proper userIds
