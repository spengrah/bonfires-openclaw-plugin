# Bonfires Integration Spec

Status: Active (dogfood-validated 2026-03-05)

## 1) Purpose

This document specifies how Bonfires (hosted) integrates with OpenClaw/Lyle as the persistent memory system. It covers the plugin design, heartbeat configuration, and content ingestion cron.

Companion to `AGENT-INTERFACE-SPEC.md` (trust-zones-graph contribution system).

---

## 2) What Bonfires replaces / complements

| Concern | Current | With Bonfires |
|---|---|---|
| Episodic memory (conversation context survives compaction) | None — lost at compaction | Bonfires episodes via `agent_end` hook |
| File/doc semantic search | OpenClaw built-in memorySearch (Venice embeddings, searches memory/ + vault/) | Bonfires `/ingest_content` + Weaviate; built-in memorySearch stays for now |
| Trust-zones-graph retrieval | Direct file reads | `tzg sync` pushes graph to Bonfires triplets |
| Per-turn context injection | None | Plugin `before_agent_start` hook → Bonfires search → `prependContext` |

The built-in `memorySearch` is not disabled yet. Both run in parallel initially. Once Bonfires content coverage is confirmed, built-in memorySearch can be phased out.

---

## 3) OpenClaw plugin

### 3.1 Purpose

A thin OpenClaw plugin (`bonfires-plugin`) provides four deterministic integration points:

1. **Per-turn context retrieval** (`before_agent_start` hook) — query Bonfires before each LLM turn using the current message as the search query; inject relevant memories as context
2. **On-demand search tool** (`bonfires_search` tool) — agent-callable tool for explicit retrieval deeper into a session
3. **Episodic capture** (`agent_end` hook) — push conversation history to Bonfires after each turn, throttled per session; covers all sessions, not just main
4. **Recovery catch-up** (scheduled recovery tick) — periodic scan of persisted session transcripts to backfill missed captures

The plugin does not implement Bonfires protocol logic. All API calls go through `bonfires-client.ts`.

### 3.2 Hook: `before_agent_start` (per-turn retrieval)

Fires before every LLM turn. Uses the current user message as the search query each time.

**No session-start guard.** Context is injected on every turn, using `event.prompt` as the search query. This means:
- Turn 1: gets context relevant to the opening message
- Turn N: gets context relevant to the current message, which may differ significantly from turn 1

**Behavior:**
1. Use `event.prompt` as the search query (truncated to 500 chars)
2. Call Bonfires `/delve` with the bonfire ID and query
3. Return `{ prependContext: <formatted results> }` if results found; return nothing if search fails or returns empty

**`prependContext` format:**
```
--- Bonfires context ---
- <result 1 summary> (source: delve:episode:0, relevance: 0.95)
- <result 2 summary> (source: delve:entity:0, relevance: 0.8)
---
```

Capped at 2000 chars. This is prepended to the current user message via `prependContext`.

**Search response handling:** `/delve` returns `episodes[]` and `entities[]`. Episodes may have `summary` (preferred) or `content` (JSON string containing `{name, content, updates}`). The client parses JSON content to extract the inner `content` field. Entity summaries may contain newlines; these are stripped to prevent format breaks.

**Latency:** Adds one HTTP round-trip to every turn. This is a deliberate tradeoff — accept ~200-500ms per turn for reliable context retrieval at each message. The hook swallows errors; a failed Bonfires call degrades gracefully with no context injected.

**Multi-session behavior:** Each session independently triggers this hook with its own `event.prompt` and `ctx.sessionKey`. No coordination needed between sessions.

### 3.3 Tool: `bonfires_search` (on-demand retrieval)

A named tool registered by the plugin. Agents call it explicitly when a topic feels unfamiliar or when deeper recall is warranted mid-session.

**Tool signature:**
```
bonfires_search(query: string, limit?: number) → { results: Array<{ summary: string, source: string, score: number }> }
```

**When it is called:** Agent-driven. The agent decides when to call it. Instructions in SOUL.md or a skill can guide when to reach for this tool (e.g., "when you encounter a topic you may have discussed before, search Bonfires first").

This complements the automatic `before_agent_start` injection — the automatic path handles each turn's immediate context; this tool handles intentional deeper recall.

### 3.4 Hook: `agent_end` (episodic capture)

Fires after every LLM turn completes, in any session. Payload includes `event.messages` (full conversation history including the just-completed reply) and `ctx.sessionKey`.

**This is the primary episodic capture mechanism.** Key advantages:
- Deterministic Node.js callback — no LLM involvement
- Covers every session automatically (main, reviewer, any future agent)
- `ctx.sessionKey` enables per-session throttling

**Throttling strategy:**
- Plugin maintains `Map<sessionKey, { lastPushedAt: number, lastPushedIndex: number }>` in memory (persisted to disk as `capture-ledger.json`)
- On each `agent_end` fire: check if >15 min since `lastPushedAt` for this `sessionKey`
- If yes: push messages from `lastPushedIndex` to current length to Bonfires `stack/add`; update ledger
- If no: skip (next turn will catch it)
- The 15-min window means at most 4 pushes/hour per session — reasonable Bonfires API load

**Message format for `stack/add`:**

Messages are sent as **paired user+assistant turns** when possible, using `{ messages: [...], is_paired: true }`. Unpaired messages (e.g., trailing user message) fall back to `{ message: {...} }`.

Each message in the payload must include these required fields:
```json
{
  "text": "the message content as plain string",
  "userId": "user",
  "chatId": "agent:main:matrix:channel:!room:matrix.org",
  "role": "user",
  "content": "the message content as plain string",
  "timestamp": "2026-03-05T00:00:00.000Z"
}
```

`text` and `userId` and `chatId` are required by the Bonfires API (Telegram-style schema). `role` and `content` are included for episode extraction context.

**Content normalization:** Assistant messages from OpenClaw may contain array content blocks (`[{type:"text", text:"..."}, {type:"tool_use", ...}]`). The client extracts only `type:"text"` blocks and joins them. Messages with no extractable text (e.g., pure `tool_use` or `tool_result`) are skipped.

**Message slicing:** Only push new messages since the last push (`messages.slice(lastPushedIndex)`). Bonfires receives incremental context, not the full history every time.

**On plugin startup:** Capture ledger is loaded from disk. First push after a fresh install sends full history to date. Acceptable — Bonfires deduplicates at the episode level.

### 3.5 Scheduled recovery tick + disk scan (fallback / catch-up)

Session transcripts are persisted to disk as JSONL files:
```
~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl
~/.openclaw/agents/<agentId>/sessions/sessions.json   (index)
```

A scheduled recovery tick (driven by heartbeat flow and/or cron cadence) scans `sessions.json` for recently updated sessions, reads JSONL transcripts, and pushes messages not yet captured to Bonfires.

**This is a catch-up mechanism, not the primary path.** It handles:
- Sessions that were active before the plugin was installed
- Sessions where `agent_end` was missed (e.g., crash, abrupt exit)
- Historical conversation recovery after Bonfires is first set up

The `lastPushedIndex` ledger from §3.4 is persisted to disk (`<stateDir>/capture-ledger.json`) so both mechanisms share the same watermark.

### 3.6 Stack processing heartbeat

The plugin runs its own background heartbeat (separate from the OpenClaw gateway heartbeat) that calls `POST /agents/{agentId}/stack/process` on a 20-minute cadence with jitter. This triggers Bonfires' episode extraction from stacked messages.

State is persisted to `<stateDir>/heartbeat-state.json` with per-agent tracking of consecutive failures, last attempt/success timestamps.

### 3.7 Plugin configuration

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
          "capture": {
            "throttleMinutes": 15
          },
          "search": {
            "maxResults": 5
          },
          "network": {
            "timeoutMs": 12000,
            "retryBackoffMs": [5000, 15000]
          },
          "ingestion": {
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

**Critical: Agent IDs must be MongoDB ObjectIds** (e.g., `69a51b279c462f4f06abe2f5`), not username strings. The `/agents/{id}/stack/add` endpoint does not resolve by username — a username string results in HTTP 403. Get the ObjectId from `GET /agents` and match by username.

`DELVE_API_KEY` is read from environment at plugin load time via `apiKeyEnv`. Not stored in `openclaw.json`.

The `agents` map connects OpenClaw agent IDs to Bonfires agent IDs. `ctx.agentId` from hook context selects the right Bonfires agent ID. Multiple OpenClaw agents can share the same Bonfires agent ID to share a knowledge graph.

### 3.8 Plugin development model

**No build step required.** TypeScript is loaded on-the-fly via `jiti`. Write `.ts` directly; OpenClaw imports and transpiles it at startup. No `tsc`, no bundler.

**Standalone repo.** The plugin lives in its own git repo at `~/.openclaw/workspace/projects/bonfires-plugin/`.

**Plugin SDK.** The SDK is a subpath export of the `openclaw` package — no separate install:
```ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
```

**Process isolation: none.** Plugins run in the same Node.js process as OpenClaw. Hook handler errors are caught and logged as warnings.

**Plugin file structure:**

```
~/.openclaw/workspace/projects/bonfires-plugin/
  package.json
  src/
    index.ts               plugin entry point (registers hooks + tools + heartbeat)
    bonfires-client.ts     Bonfires API client (mock + hosted implementations)
    hooks.ts               before_agent_start, agent_end, session_end handlers
    config.ts              config parsing and validation
    heartbeat.ts           stack processing heartbeat + recovery tick
    capture-ledger.ts      in-memory + disk-persisted capture watermark ledger
    ingestion.ts           content ingestion with hash-based dedup
    tools/
      bonfires-search.ts   bonfires_search tool registration
  tests/
    wave1.test.ts          plugin skeleton + mocked client tests
    wave2-hosted.test.ts   hosted API client tests
    wave3-heartbeat.test.ts heartbeat + recovery tests
    wave5-hosted-verification.test.ts
    wave6-ingestion.test.ts
    wave7-packaging.test.ts
    wave8-profiles.test.ts
```

**State directory:** Runtime state stored in `<stateDir>` (default: `.bonfires-state/` resolved via `api.resolvePath`). Set an explicit absolute `stateDir` in config to avoid path resolution ambiguity.

State files:
- `capture-ledger.json` — per-session capture watermarks
- `heartbeat-state.json` — per-agent heartbeat tracking
- `ingestion-state.json` — file hash ledger for content ingestion

---

## 4) Heartbeat configuration

The OpenClaw heartbeat timer is still configured and running — it fires every 20 min and triggers a HEARTBEAT.md turn in the main session. However, Bonfires episodic capture is now handled by the `agent_end` hook (§3.4), not by HEARTBEAT.md instructions.

HEARTBEAT.md is available for other standing tasks unrelated to Bonfires.

---

## 5) Content ingestion cron

### 5.1 Purpose

Pushes file-based knowledge into Bonfires (Weaviate vector store) so that `before_agent_start` search returns relevant document content alongside episodic memories.

This is separate from episodic capture (§3.4) — it covers files, not conversations.

### 5.2 Content scope

| Source | Path | Frequency | Notes |
|---|---|---|---|
| Daily memory files | `memory/YYYY-MM-DD.md` | Post-session + nightly | Highest value; curated session summaries |
| Vault | `vault/**/*.md` | Nightly | Reference material, research notes |
| Trust-zones-graph (stable nodes) | `memory/context-graph-memory/trust-zones-graph/**/*.yaml` | Nightly (or via `tzg sync`) | Pushed as triplets, not documents — handled by `tzg sync` separately |
| Project artifacts | `projects/*/README.md`, `projects/*/.ai/spec/*.md` | Nightly | Spec documents and project overviews only; not source code |

### 5.3 Ingestion pipeline

`POST /ingest_content` writes documents to MongoDB labeled_chunks. Vectorization into Weaviate requires a separate daily workflow (`/vector_store/setup` or `/trigger_taxonomy`) that is admin-only on the Bonfires side.

The plugin uses hash-based deduplication: SHA-256 hash of each file is compared against `<stateDir>/ingestion-state.json`. Only changed/new files are pushed.

### 5.4 Relevant endpoints

| Endpoint | Purpose |
|---|---|
| `POST /ingest_content` | Ingest doc into vector store + trigger graph extraction |
| `POST /ingest_content_vector_only` | Vector store only, no graph extraction (faster for bulk) |
| `POST /vector_store/search` | Pure vector similarity search across ingested chunks |
| `POST /vector_store/search_label` | Search chunks by taxonomy label |
| `GET /bonfire/{bonfire_id}/labeled_chunks` | Browse ingested chunks with their labels |
| `GET /vector_store/chunks/{bonfire_id}` | List all chunks for a bonfire |

---

## 6) Resolved questions

**Bonfires search API shape:** Resolved. `/delve` returns `episodes[]` and `entities[]`. Episodes have `summary`/`content`/`name`; entities have `summary`/`name`. The `content` field on episodes is a JSON string containing `{name, content, updates}` — the client parses it to extract the inner `content` text. `prependContext` format confirmed working.

**`stack/add` message format:** Resolved. `stack/add` accepts `{ message: { text, userId, chatId, ... } }` (single) or `{ messages: [...], is_paired: true }` (paired batch). Required fields: `text`, `userId`, `chatId`. The `role`/`content`/`timestamp` fields are included for episode extraction. Paired format is recommended by the Bonfires team for better episodic context.

**Agent ID format:** Resolved. Must be MongoDB ObjectId (e.g., `69a51b279c462f4f06abe2f5`), not username string. The API key is scoped by bonfire ID, not by agent.

**Multiple agents sharing knowledge graph:** Resolved. Multiple OpenClaw agents (main, reviewer) can share the same Bonfires agent ID. Both push to and read from the same knowledge graph. Separate Bonfires agents can be created if isolation is desired.

**Per-turn search latency:** Not yet measured under production load. Accepted as-is for dogfood; optimize if latency proves unacceptable.

**`prependContext` framing:** Current format uses `--- Bonfires context ---` header with bullet-pointed results. Working acceptably in dogfood.

**Vector store population:** `/ingest_content` writes to MongoDB labeled_chunks but NOT directly to Weaviate. Weaviate population requires admin-only `/vector_store/setup` or `/trigger_taxonomy` (daily workflow on Bonfires side).
