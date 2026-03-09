# bonfires-plugin

OpenClaw plugin that connects agents to [Bonfires](https://bonfires.ai) for persistent memory, retrieval, and ingestion.

It supports both the legacy hook-based integration and the newer Context Engine path now used for runtime retrieval/capture. The legacy runtime hooks are still present for backward compatibility and reference, but the active architecture has shifted toward explicit tools plus `registerContextEngine('bonfires', ...)`.

## Feature overview

`bonfires-plugin` currently provides these capabilities:

1. **Bonfires Context Engine (current runtime path)**
   - Registers a `bonfires` context engine via `api.registerContextEngine?.('bonfires', ...)`.
   - `assemble()`:
     - preserves stable `systemGuidance`
     - optionally performs dynamic Bonfires retrieval when `retrieval.enableDynamicRetrieval` is enabled
     - supports raw user content retrieval in the context-engine path
     - remains fail-open on retrieval errors
     - if `sessionId` is absent, retrieval still proceeds without session scope and emits a warning
   - `afterTurn()`:
     - captures only the post-turn delta using `prePromptMessageCount`
     - stays delta-safe across repeated turns in the same session
     - defaults missing `prePromptMessageCount` to zero
     - skips capture when `sessionId` is missing/empty because capture routing needs a session key
     - remains fail-open on capture errors
   - `compact()` is explicitly a no-op because the plugin does not own compaction.

2. **Knowledge retrieval tools**
   - `bonfires_search(query, limit?)`
     - searches processed Bonfires knowledge via `/delve`
     - returns normalized graph/episode results
   - `bonfires_stack_search(query, limit?)`
     - searches recent unprocessed stack memory via `/stack/search`
     - useful for very recent conversation recall before heartbeat/session-end processing

3. **Immediate episodic capture + background processing**
   - Every completed turn can be captured to Bonfires stack storage.
   - Heartbeat processing periodically calls stack processing (`/agents/{id}/stack/process`).
   - `session_end` flushes remaining messages and triggers processing.
   - `before_compaction` triggers stack processing and resets the watermark guard.
   - Capture sanitization preserves conversational content while stripping metadata wrappers, injected context markers, assistant tool/thinking noise, and reply directives.
   - Assistant messages can use configured display names from OpenClaw agent config.

4. **System guidance and retrieval policy controls**
   - `retrieval.systemGuidance` injects stable system-level guidance separately from retrieved memory snippets.
   - `retrieval.enableDynamicRetrieval` controls whether runtime Bonfires retrieval is performed in the Context Engine path.
   - Prompt-policy constrained paths degrade safely instead of crashing turns.

5. **Approval-gated link ingestion workflow (PM16)**
   - `bonfires_prepare_ingest_approval`
     - creates a session-bound approval token for an exact, user-approved URL set already observed in the session
   - `bonfires_ingest_links`
     - ingests only the exact URL set authorized by that approval token
     - rejects raw-list bypasses, invalid/expired/cross-session tokens, and oversized/unapproved sets
   - This is the preferred multi-link ingestion flow for user-shared or discovered links.

6. **Link discovery for later approval (PM17)**
   - `discover_links(query, maxCandidates?)`
     - feature-flagged
     - returns untrusted candidate links plus metadata
     - does **not** ingest anything by itself
   - Any discovered links still require explicit user approval plus an approval token before ingestion.

7. **Single-link ingestion tool (PM15)**
   - `bonfires_ingest_link(url)`
     - explicit user-invoked ingestion for a single URL
     - classifies links and routes supported content into Bonfires ingestion lanes
     - extracts readable text from HTML pages
     - supports deterministic PDF routing
   - This remains supported, but the approval-token flow is the more general path for multiple approved links.

8. **Transport and ingestion safety controls**
   - Only `http`/`https` links are allowed.
   - Private, loopback, link-local, and metadata hosts are blocked.
   - Redirects are revalidated hop-by-hop and capped.
   - Response-size/time bounds are enforced.
   - Duplicate semantics are normalized so duplicate ingests become safe no-op/success outcomes where appropriate.

9. **Profile-based file ingestion cron (PM4/PM6/PM14)**
   - Optional periodic local-content ingestion.
   - Supports profile-based root/include/exclude/extensions config.
   - Supports agent-to-profile mapping plus default profile fallback.
   - Routes `.pdf` files to `/ingest_pdf` and text-like content to `/ingest_content`.
   - Persists hash-ledger state to avoid re-ingesting unchanged files.

## Deprecated / legacy behavior

These surfaces are still present, but should be understood as legacy compatibility paths rather than the primary runtime architecture:

1. **`handleBeforeAgentStart` legacy retrieval hook**
   - Marked deprecated in source.
   - Kept for backward compatibility/reference.
   - Historically handled first-message retrieval/injection.
   - Runtime retrieval now primarily lives in `ContextEngine.assemble()`.

2. **`handleAgentEnd` legacy capture hook**
   - Marked deprecated in source.
   - Kept for backward compatibility/reference.
   - Runtime per-turn episodic capture now primarily lives in `ContextEngine.afterTurn()`.

3. **Legacy `ingestion.rootDir` config**
   - Still accepted for backward compatibility.
   - Automatically synthesized into a `_legacy` profile if no explicit ingestion profiles exist.
   - Deprecated in favor of `ingestion.profiles`.

Notes:
- `session_end` and `before_compaction` hooks are still active and not deprecated.
- PM12 first-message-only injection behavior is preserved for the legacy hook path and backward-compat scenarios.

## Install

### Local link install (development)

```bash
openclaw plugins install -l /path/to/bonfires-plugin
```

### NPM install (pinned)

```bash
openclaw plugins install bonfires-plugin --pin
```

### Verify install

```bash
openclaw plugins doctor
```

## Configuration

Add a `bonfires-plugin` entry in `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "bonfires-plugin": {
        "enabled": true,
        "config": {
          "agents": {
            "main": "69a51b279c462f4f06abe2f5"
          }
        }
      }
    }
  }
}
```

### Env-first setup (recommended)

```bash
export BONFIRES_BASE_URL="https://tnt-v2.api.bonfires.ai/"
export BONFIRES_API_KEY_ENV="DELVE_API_KEY"
export DELVE_API_KEY="your-api-key"
export BONFIRE_ID="your-bonfire-id"
```

### Config reference

| Field | Type | Default | Notes |
|---|---|---|---|
| `agents` | object | _(required)_ | OpenClaw agent id -> Bonfires agent id mapping |
| `baseUrl` | string | `https://tnt-v2.api.bonfires.ai/` | Can also come from `BONFIRES_BASE_URL` |
| `apiKeyEnv` | string | `DELVE_API_KEY` | Can also come from `BONFIRES_API_KEY_ENV`; this is the env-var *name* containing the API key |
| `bonfireId` | string | `""` | Can also come from `BONFIRE_ID` |
| `search.maxResults` | number | `5` | Default Bonfires retrieval limit |
| `processing.intervalMinutes` | number | `20` | Heartbeat stack-processing interval |
| `network.timeoutMs` | number | `12000` | HTTP timeout |
| `strictHostedMode` | boolean | `false` | Throw instead of falling back to mock client when hosted credentials are missing |
| `stateDir` | string | `.bonfires-state` | Runtime state directory |
| `retrieval.systemGuidance` | string | unset | Stable system guidance injected separately from retrieved context |
| `retrieval.enableDynamicRetrieval` | boolean | `false` | Enables Context Engine runtime retrieval |
| `discovery.enabled` | boolean | `false` | Enables `discover_links` |
| `discovery.maxCandidates` | number | `10` | Bounded to `1..25` |
| `ingestion.enabled` | boolean | `false` | Enable periodic local ingestion |
| `ingestion.everyMinutes` | number | `1440` | Ingestion interval |
| `ingestion.approval.maxUrlsPerRun` | number | `10` | Bounded to `1..10` |
| `ingestion.profiles.<name>.*` | object | | Profile-based local ingestion config |
| `ingestion.agentProfiles` | object | `{}` | Agent -> profile mapping |
| `ingestion.defaultProfile` | string | unset | Default ingestion profile fallback |
| `ingestion.rootDir` | string | legacy | Deprecated; supported only as backward-compatible profile synthesis |

Precedence: **config value > env fallback > default**.

## Repo structure

```text
src/
  index.ts                         plugin entry (register hooks/tools/context engine/heartbeat)
  context-engine.ts                current runtime retrieval + afterTurn capture path
  hooks.ts                         shared retrieval/capture helpers + legacy hook compatibility
  bonfires-client.ts               hosted + mock Bonfires client boundary
  config.ts                        config parsing/validation
  capture-ledger.ts                watermark + first-message injection tracking
  approval-store.ts                session-bound approval token state
  heartbeat.ts                     stack processing heartbeat + recovery logic
  ingestion.ts                     file ingestion cron + hash-ledger dedup
  ingestion-core.ts                ingestion classification + duplicate semantics
  transport-safety.ts              URL/fetch guards
  html-extract.ts                  readable-text extraction for HTML link ingestion
  message-utils.ts                 user-message extraction / metadata stripping helpers
  tools/
    bonfires-search.ts
    bonfires-stack-search.ts
    bonfires-ingest-link.ts
    prepare-ingest-approval.ts
    bonfires-ingest-links.ts
    discover-links.ts

tests/
  wave1.test.ts ... wave15-pm20-pm23.test.ts
  REQUIREMENT-MAPPING.md

.ai/spec/
  BONFIRES-INTEGRATION-SPEC.md
  spec/
    requirements-index.md
    retrieval/
    capture/
    processing/
    ingestion/
    context-engine/
    client/
    config/
    quality/
  guidance/
    retrieval/
    capture/
    processing/
    ingestion/
    context-engine/
    client/
    config/
```

## Runtime behavior notes

- Hooks and Context Engine methods are **fail-open**: plugin errors are logged and do not crash host turns.
- In the Context Engine path:
  - `afterTurn()` requires `sessionId` to route capture and skips capture when it is absent.
  - `assemble()` can still retrieve without `sessionId`; it just proceeds without session scope.
- `chatId` in hosted capture uses `sessionId` when present, else `sessionKey` (PM12 behavior).
- Link-sharing detection records candidate URLs from user messages so exact approved subsets can later be tokenized and ingested.
- Discovery output is untrusted candidate data; explicit user approval is still required before ingestion.

## Quality gates and verification

Quick commands:

```bash
npm run lint
npm run test
npm run gate:traceability
npm run gate:all
```

Also available:

```bash
npm run test:coverage
npm run verify:hosted
npm run ingest:bonfires
```

`gate:all` runs the full verification pipeline, including lint, tests/coverage, changed-lines coverage, quality heuristics, mutation-lite, traceability, and integrity/escalation checks.

## Troubleshooting

- **Plugin not discovered**: run `openclaw plugins doctor`; verify plugin manifest/package metadata.
- **Unexpected mock client fallback**: verify `apiKeyEnv` target variable and `bonfireId`; use `strictHostedMode: true` to hard-fail.
- **No capture for an agent**: ensure the OpenClaw `agentId` exists in `config.agents`.
- **No session-scoped capture in Context Engine**: `afterTurn()` requires `sessionId`; without it, capture is intentionally skipped.
- **Discovery disabled**: set `discovery.enabled: true` before expecting `discover_links` results.
- **Approval-token ingestion rejected**: ensure the approved URL set exactly matches URLs already observed in-session and that the token is fresh and same-session.
- **Ingestion profile mapping errors**: ensure profile names referenced by `agentProfiles`/`defaultProfile` exist under `ingestion.profiles`.

## Specs and traceability

- Canonical requirements index: `.ai/spec/spec/requirements-index.md`
- Traceability map: `.ai/spec/spec/quality/traceability-map.json`
- Test mapping: `tests/REQUIREMENT-MAPPING.md`
- Integration overview: `.ai/spec/BONFIRES-INTEGRATION-SPEC.md`

For requirement-level detail, start with the integration spec, then the unified requirements index.
