# Bonfires Integration Spec

Status: Draft

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

The plugin does not implement Bonfires protocol logic. All API calls go through a small `bonfires-client.mjs` module.

### 3.2 Hook: `before_agent_start` (per-turn retrieval)

Fires before every LLM turn. Uses the current user message as the search query each time.

**No session-start guard.** Context is injected on every turn, using `event.prompt` as the search query. This means:
- Turn 1: gets context relevant to the opening message
- Turn N: gets context relevant to the current message, which may differ significantly from turn 1

**Behavior:**
1. Use `event.prompt` as the search query
2. Call Bonfires search with the agent ID (`ctx.agentId`)
3. Return `{ prependContext: <formatted results> }` if results found; return nothing if search fails or returns empty

**`prependContext` format:**
```
## Retrieved context

<result 1 summary>

<result 2 summary>

---
```

This is prepended to the current user message. The LLM sees it as the beginning of the user turn. Framing ("Retrieved context") is needed because `prependContext` lands in user-turn content, not the system prompt — confirmed in source (`systemPrompt` return from the hook is defined in types but never read at the call site).

**Latency:** Adds one HTTP round-trip to every turn. This is a deliberate tradeoff — accept ~200-500ms per turn for reliable context retrieval at each message. The hook swallows errors; a failed Bonfires call degrades gracefully with no context injected.

**Throttling (optional, post-MVP):** If per-turn latency proves unacceptable, add a per-session query cache: skip the search if the semantic similarity between `event.prompt` and the previous query for that `ctx.sessionKey` exceeds a threshold. Deferred until the baseline is profiled.

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

**This is the primary episodic capture mechanism.** It replaces the heartbeat-based approach. Key advantages:
- Deterministic Node.js callback — no LLM involvement
- Covers every session automatically (main, reviewer, any future agent)
- `ctx.sessionKey` enables per-session throttling

**Throttling strategy:**
- Plugin maintains `Map<sessionKey, { lastPushedAt: number, lastPushedIndex: number }>` in memory
- On each `agent_end` fire: check if >15 min since `lastPushedAt` for this `sessionKey`
- If yes: push messages from `lastPushedIndex` to current length to Bonfires `stack/process`; update ledger
- If no: skip (next turn will catch it)
- The 15-min window means at most 4 pushes/hour per session — reasonable Bonfires API load

**Message slicing:** Only push new messages since the last push (`messages.slice(lastPushedIndex)`). Bonfires receives incremental context, not the full history every time.

**On plugin startup:** Initialize `lastPushedIndex` to 0 for all sessions. First push after startup sends full history to date. Acceptable — Bonfires deduplicates at the episode level.

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

The `lastPushedIndex` ledger from §3.4 is persisted to disk (`~/.openclaw/bonfires-capture-state.json`) so both mechanisms share the same watermark.

### 3.6 Plugin configuration

```json
{
  "plugins": [
    {
      "id": "bonfires-plugin",
      "config": {
        "agents": {
          "main": {
            "agentId": "<lyle-bonfires-agent-id>"
          },
          "reviewer": {
            "agentId": "<reviewer-bonfires-agent-id>"
          }
        },
        "apiKey": "<from env: BONFIRES_API_KEY>",
        "baseUrl": "https://app.bonfires.ai",
        "capture": {
          "throttleMinutes": 15
        },
        "search": {
          "maxResults": 5,
          "minScore": 0.7
        }
      }
    }
  ]
}
```

`BONFIRES_API_KEY` is read from environment at plugin load time. Not stored in `openclaw.json`.

The `agents` map connects OpenClaw agent IDs to Bonfires agent IDs. `ctx.agentId` from hook context selects the right Bonfires agent ID. Requires Bonfires hosted plan to support multiple agent IDs under one account — confirm before implementation.

### 3.7 Plugin development model

**No build step required.** TypeScript is loaded on-the-fly via `jiti`. Write `.ts` directly; OpenClaw imports and transpiles it at startup. No `tsc`, no bundler. Plain `.mjs` also works.

**Standalone repo.** The plugin lives in its own git repo, symlinked or copied into `~/.openclaw/extensions/bonfires-plugin/`. No monorepo, no npm publish required.

**Plugin SDK.** The SDK is a subpath export of the `openclaw` package — no separate install:
```ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
```
`jiti` aliases this to the actual dist path at load time, so `openclaw` does not need to be in the plugin's own `node_modules`.

**External dependencies.** The only expected external dependency is `@sinclair/typebox` (for tool parameter schemas). It is already present in OpenClaw's `node_modules` — verify at implementation time whether it resolves transitively or needs to be declared in the plugin's `package.json`.

**Process isolation: none.** Plugins run in the same Node.js process as OpenClaw. Hook handler errors are caught and logged as warnings. Code running outside hook handlers (e.g., in `registerService`) is fully exposed — keep startup code minimal and defensive.

**Plugin location:**

```
~/.openclaw/extensions/bonfires-plugin/   ← symlink to repo working copy
  package.json
  index.ts               plugin entry point (registers hooks + tools)
  bonfires-client.ts     thin Bonfires API client
```

**`package.json`:**
```json
{
  "name": "bonfires-plugin",
  "type": "module",
  "openclaw": { "extensions": ["./index.ts"] }
}
```

OpenClaw discovers the plugin by scanning `~/.openclaw/extensions/` on startup. No additional registration needed.

---

## 4) Heartbeat configuration

The OpenClaw heartbeat timer is still configured and running — it fires every 20 min and triggers a HEARTBEAT.md turn in the main session. However, Bonfires episodic capture is now handled by the `agent_end` hook (§3.4), not by HEARTBEAT.md instructions.

HEARTBEAT.md is available for other standing tasks unrelated to Bonfires.

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "20m",
        "session": "main",
        "target": "none"
      }
    }
  }
}
```

`target: "none"` — heartbeat results are not delivered to any channel unless the agent produces alert content. Prevents heartbeat noise in Telegram/Discord.

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

**Post-session trigger for daily memory files:** The `agent_end` hook already fires after each turn. At session end (detected by inactivity or a `session_end` hook if it becomes available), trigger ingestion for `memory/YYYY-MM-DD.md` only. This ensures today's memory file is in Bonfires before the next session starts, without waiting for the nightly cron. Deferred to post-MVP.

### 5.3 Ingestion script

A standalone script `ingest-to-bonfires.mjs` (not an OpenClaw plugin). Runs as a cron job.

**Algorithm:**
1. Walk target directories
2. For each file: compute SHA-256 hash; compare against `~/.openclaw/bonfires-ingest-state.json` (hash ledger)
3. Push changed/new files to `POST /ingest_content`
4. Update hash ledger on success
5. Log results (file count, bytes, errors) to `~/.openclaw/logs/bonfires-ingest.log`

**Hash ledger format (`bonfires-ingest-state.json`):**
```json
{
  "version": 1,
  "entries": {
    "memory/2026-03-01.md": { "hash": "sha256:...", "pushedAt": "2026-03-01T23:00:00Z" },
    "vault/career/goals.md": { "hash": "sha256:...", "pushedAt": "2026-02-28T03:00:00Z" }
  }
}
```

### 5.4 Cron schedule

```cron
# Nightly ingestion (2am, after daily memory file is settled)
0 2 * * * /home/lyle/.openclaw/bin/ingest-to-bonfires.mjs >> ~/.openclaw/logs/bonfires-ingest.log 2>&1
```

---

## 6) Open questions

**Bonfires search API shape:** The exact endpoint and request/response format for semantic search is not yet confirmed. The plugin's `bonfires-client.mjs` needs to be written against the actual API docs. Specifically: does search return episode summaries, raw message text, or extracted entities? This determines how `prependContext` is formatted.

**`stack/process` message format:** What does the episodic capture call need to send? Does `stack/process` accept raw `{role, content}[]` message arrays, or a different format? The OpenClaw JSONL format uses Anthropic API message shapes — confirm Bonfires accepts these directly or needs transformation.

**Multiple agent IDs on hosted plan:** The plugin maps OpenClaw agent IDs (main, reviewer) to distinct Bonfires agent IDs. Confirm the hosted plan supports this before speccing reviewer integration further. If not, episodic memory for all agents would share one ID (undesirable).

**Per-turn search latency acceptability:** `before_agent_start` fires on every turn with a Bonfires search. Measure actual p50/p99 latency of the hosted search endpoint under load before committing to this model. If unacceptable, fall back to session-start-only injection or the throttled cache approach.

**`prependContext` framing:** Injected context lands in user-turn content, not the system prompt. The "## Retrieved context" header is a workaround. Evaluate whether this confuses the LLM in practice (user turn vs. retrieved context) after initial implementation.
