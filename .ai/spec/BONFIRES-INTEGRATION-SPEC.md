# Bonfires Integration Spec

Status: Active (updated 2026-03-07, reflects PM10-PM15 planning)

## 1) Purpose

This document specifies how Bonfires (hosted) integrates with OpenClaw/Lyle as the persistent memory system. It covers the plugin design, heartbeat configuration, and content ingestion cron.

---

## 2) What Bonfires replaces / complements

| Concern | Current | With Bonfires |
|---|---|---|
| Episodic memory (conversation context survives compaction) | None — lost at compaction | Bonfires episodes via `agent_end` hook |
| File/doc semantic search | OpenClaw built-in memorySearch (Venice embeddings) | Bonfires `/ingest_content` + Weaviate; built-in memorySearch stays for now |
| Per-turn context injection | None | Plugin `before_agent_start` hook → Bonfires search → `prependContext` |

---

## 3) OpenClaw plugin

### 3.1 Purpose

A thin OpenClaw plugin (`bonfires-plugin`) provides deterministic integration points:

1. **Per-session context retrieval** (`before_agent_start` hook) — query Bonfires on the first message of each session; inject relevant memories as context
2. **On-demand search tools** (`bonfires_search` + `bonfires_stack_search` tools) — agent-callable tools for explicit retrieval
3. **Immediate episodic capture** (`agent_end` hook) — push conversation history to Bonfires after every turn with no throttling
4. **Session-end flush** (`session_end` hook) — flush remaining messages and trigger episode extraction
5. **Compaction guard** (`before_compaction` hook) — trigger episode extraction and reset watermark before transcript rewrite

The plugin does not implement Bonfires protocol logic. All API calls go through `bonfires-client.ts`.

### 3.2 Hook: `before_agent_start` (per-session retrieval)

Fires before every LLM turn. Only injects context on the **first message of each session** (PM12).

**Behavior:**
1. Check if prompt contains OpenClaw metadata wrappers (real user message). Skip system-generated messages.
2. Extract user message text via `extractUserMessage()`, truncate to 500 chars for query
3. Check injection tracker — if this `sessionId` has already been injected, skip
4. Call Bonfires `/delve` with the bonfire ID and query
5. Mark session as injected on successful search
6. Return `{ prependContext: <formatted results> }` if results found

**`prependContext` format:**
```
--- Bonfires context ---
- <result 1 summary> (source: delve:episode:0, relevance: 0.95)
- <result 2 summary> (source: delve:entity:0, relevance: 0.8)
---
```

Capped at 2000 chars. Errors are swallowed — failed Bonfires calls degrade gracefully.

### 3.3 Tools: `bonfires_search` + `bonfires_stack_search`

Two named tools registered by the plugin:

**`bonfires_search`** — searches the knowledge graph (processed episodes + entities via `/delve`)
```
bonfires_search(query: string, limit?: number) → { results: [...] }
```

**`bonfires_stack_search`** (PM12) — searches recent unprocessed stack messages via `/stack/search`
```
bonfires_stack_search(query: string, limit?: number) → { results: [...], count, query }
```

### 3.4 Hook: `agent_end` (immediate capture)

Fires after every LLM turn. Pushes messages to Bonfires immediately with **no throttling** (PM10).

**Behavior:**
1. Resolve Bonfires agent ID from `ctx.agentId` via config `agents` map. Skip if unmapped.
2. Get watermark for `ctx.sessionKey`. Compute slice from `lastPushedIndex + 1`.
3. Watermark reset guard: if `lastPushedIndex >= msgs.length`, log warning, reset to 0.
4. Resolve agent display name: `api.config.agents.list[ctx.agentId].name` → fallback `ctx.agentId` (PM13)
5. Call `client.capture()` with message slice and `agentDisplayName`
6. Update watermark on success. Do **not** call `processStack`.

**Message sanitization (PM11):**

Messages are cleaned before sending to `stack/add`:

*User messages:*
1. Extract text from content blocks
2. Strip prependContext injection (`--- Bonfires context ---`)
3. Extract sender name from OpenClaw metadata → `userId` (preference: `name` > `username` > `id` > `"user"`)
4. Strip metadata wrappers via `extractUserMessage()` → clean `text`

*Assistant messages:*
1. Filter to `type: "text"` blocks only (strip thinking, toolCall)
2. Strip `[[reply_to_current]]` prefix
3. Use resolved agent display name for `userId`/`username` (PM13)
4. Skip messages with no extractable text

**Stack message format:**
```json
{
  "text": "cleaned message content",
  "userId": "Spencer",
  "chatId": "<sessionId or sessionKey>",
  "timestamp": "ISO-8601",
  "role": "user",
  "username": "Spencer"
}
```

Messages are sent as **paired user+assistant turns** when possible (`{ messages: [...], is_paired: true }`). Unpaired messages fall back to single-message format.

**`chatId`:** Uses `ctx.sessionId` (PM12), falling back to `ctx.sessionKey`.

### 3.5 Hook: `session_end` (flush + process)

1. Flush any uncaptured messages (same watermark logic as agent_end, with display name)
2. Call `processStack` to finalize pending episodes before session closes

### 3.6 Hook: `before_compaction` (guard)

1. Call `processStack` to finalize pending stack messages
2. Reset watermark to `lastPushedIndex: -1` (transcript will be rewritten)

### 3.7 Stack processing heartbeat

Background heartbeat calls `POST /agents/{agentId}/stack/process` every 20 minutes (+ jitter). This triggers Bonfires' episode extraction from stacked messages.

State persisted to `<stateDir>/heartbeat-state.json`. Recovery tick scans persisted sessions as a safety net.

### 3.8 Plugin configuration

```json
{
  "plugins": {
    "entries": {
      "bonfires-plugin": {
        "enabled": true,
        "config": {
          "agents": {
            "main": "69a51b279c462f4f06abe2f5",
            "reviewer": "69a51b279c462f4f06abe2f5"
          },
          "baseUrl": "https://tnt-v2.api.bonfires.ai/",
          "apiKeyEnv": "DELVE_API_KEY",
          "bonfireId": "69a51afc9c462f4f06abe2f4",
          "stateDir": "/home/lyle/.openclaw/.bonfires-state",
          "search": { "maxResults": 5 },
          "processing": { "intervalMinutes": 20 },
          "network": { "timeoutMs": 12000 },
          "ingestion": {
            "enabled": true,
            "everyMinutes": 60,
            "profiles": {
              "lyle": {
                "rootDir": "/home/lyle/.openclaw/workspace",
                "extensions": [".md", ".yaml", ".txt"],
                "includeGlobs": ["memory/**", "vault/**", "projects/*/README.md", "projects/*/.ai/spec/**"]
              }
            }
          }
        }
      }
    }
  }
}
```



**Agent display names** are resolved from OpenClaw's agent config (`api.config.agents.list`), not from plugin config. For example, if the main agent has `"name": "Lyle"`, assistant messages will show `userId: "Lyle"` instead of the Bonfires ObjectId.

**Agent IDs in the `agents` map must be MongoDB ObjectIds** (e.g., `69a51b279c462f4f06abe2f5`).

### 3.9 Plugin file structure

```
src/
  index.ts               plugin entry (registers hooks + tools + heartbeat, builds display name map)
  bonfires-client.ts     Bonfires API client (mock + hosted implementations)
  hooks.ts               before_agent_start, agent_end, session_end, before_compaction handlers
  message-utils.ts       shared prompt metadata extraction helpers
  config.ts              config parsing and validation
  heartbeat.ts           stack processing heartbeat + recovery tick
  capture-ledger.ts      capture watermark ledger with injection tracking (persisted when ledger path is configured)
  ingestion.ts           content ingestion with hash-based dedup
  tools/
    bonfires-search.ts        bonfires_search tool
    bonfires-stack-search.ts  bonfires_stack_search tool (PM12)
tests/
  wave1.test.ts through wave10-pm13.test.ts
```

---

## 4) Content ingestion

Content ingestion uses endpoint routing by source type:

1. **Text lane** — `POST /ingest_content`
   - Existing path for text-like files discovered via ingestion profiles.
   - Uses hash-based dedup semantics in plugin ledger (PM4/PM6).

2. **PDF lane (PM14, Phase A)** — `POST /ingest_pdf`
   - Activated when profile `extensions` includes `.pdf`.
   - Uploads binary PDF directly to Bonfires (`bonfire_id` + multipart `file`).
   - No local PDF extraction/chunking in plugin; Bonfires handles document processing.
   - Failure is per-file (run continues), consistent with fail-open policy.

Current PM14 scope is workspace profile ingestion only.

PM15 extends ingestion to user-provided links with **explicit per-link confirmation** and shared routing core reuse:
- Linked PDF -> `/ingest_pdf`
- Linked text/common text files -> `/ingest_content`
- Linked HTML -> deterministic readable-content extraction then `/ingest_content`

PM15 keeps transport safety guards (`http/https`, SSRF protections, timeout/size/redirect limits) and per-link failure isolation.
Redirect-hop limits are expected to be deterministically enforced at application layer (not only runtime default follow behavior). Duplicate outcomes are treated as success/no-op using tolerant duplicate-indicator matching (not exact-string-only).

---

## 5) Supersession history

| PM | Description | Status |
|---|---|---|
| PM1 | Throttled agent_end capture | **Superseded by PM10** |
| PM7 | Compaction flush | **Superseded by PM10** |
| PM8 | Watermark reset on truncation | **Retained as guard within PM10** |
| PM9 | prependContext stripping | **Retained within PM11** |
| PM10 | Immediate stack capture | **Active** |
| PM11 | Capture message sanitization | **Active** |
| PM12 | Stack search tool + first-message-only injection + sessionId chatId | **Active** |
| PM13 | Agent display names in stack messages | **Active** |
| PM14 | PDF ingestion routing (`.pdf` -> `/ingest_pdf`) | **Active (Phase A)** |
| PM15 | Linked content ingestion with per-link confirmation + HTML extraction | **Active (implementation/remediation)** |
