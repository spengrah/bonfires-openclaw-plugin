# bonfires-plugin

OpenClaw plugin that connects agents to [Bonfires](https://bonfires.ai) for persistent conversation memory and searchable knowledge.

## What it does

`bonfires-plugin` adds four memory capabilities to OpenClaw:

1. **Context injection before turns** (`before_agent_start`)
   - Runs Bonfires retrieval for the first user message in a session (PM12 behavior).
   - Returns bounded `prependContext` when relevant memory is found.

2. **Agent-callable search tools**
   - `bonfires_search(query, limit?)` for processed graph memory (`/delve`).
   - `bonfires_stack_search(query, limit?)` for recent unprocessed stack memory (`/stack/search`).

3. **Immediate per-turn capture** (`agent_end`)
   - Captures new messages after every turn to Bonfires stack (`/agents/{id}/stack/add`).
   - Uses capture watermarks to send only uncaptured transcript tail.
   - PM10 removed runtime throttling from hook behavior.

4. **Background processing + safety flushes**
   - Heartbeat triggers stack processing (`/agents/{id}/stack/process`).
   - `session_end` flushes remaining messages and processes stack.
   - `before_compaction` processes stack + resets watermark guard.

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
export BONFIRES_API_KEY_ENV="DELVE_API_KEY"   # name of env var containing key
export DELVE_API_KEY="your-api-key"            # actual key
export BONFIRE_ID="your-bonfire-id"
```

### Config reference

| Field | Type | Default | Env fallback | Notes |
|---|---|---|---|---|
| `agents` | object | _(required)_ | | OpenClaw agent id -> Bonfires agent id mapping |
| `baseUrl` | string | `https://tnt-v2.api.bonfires.ai/` | `BONFIRES_BASE_URL` | Bonfires API base URL |
| `apiKeyEnv` | string | `DELVE_API_KEY` | `BONFIRES_API_KEY_ENV` | Name of env var holding API key |
| `bonfireId` | string | `""` | `BONFIRE_ID` | Bonfire/workspace id |
| `search.maxResults` | number | `5` | | Default search result limit |
| `processing.intervalMinutes` | number | `20` | | Heartbeat stack processing interval (minutes) |
| `network.timeoutMs` | number | `12000` | | HTTP timeout |
| `strictHostedMode` | boolean | `false` | | Throw instead of mock fallback when hosted credentials missing |
| `stateDir` | string | `.bonfires-state` | | Runtime state directory |
| `ingestion.enabled` | boolean | `false` | | Enable periodic ingestion |
| `ingestion.everyMinutes` | number | `1440` | | Ingestion interval |
| `ingestion.profiles.<name>.*` | object | | | Profile-based ingestion config |
| `ingestion.agentProfiles` | object | `{}` | | Agent -> profile mapping |
| `ingestion.defaultProfile` | string | | | Fallback profile |

Precedence: **config value > env fallback > default**.

## Repo structure

```text
src/
  index.ts               plugin entry (register hooks/tools/heartbeat)
  hooks.ts               before_agent_start / agent_end / session_end / before_compaction
  bonfires-client.ts     hosted + mock Bonfires client boundary
  config.ts              config parsing/validation
  capture-ledger.ts      capture watermark + injection tracking
  heartbeat.ts           stack processing heartbeat + recovery logic
  ingestion.ts           ingestion cron + hash-ledger dedup
  tools/
    bonfires-search.ts
    bonfires-stack-search.ts

tests/
  wave1.test.ts ... wave10-pm13.test.ts
  REQUIREMENT-MAPPING.md

.ai/spec/
  BONFIRES-INTEGRATION-SPEC.md
  spec/
    requirements-index.md
    retrieval/ capture/ processing/ ingestion/ client/ config/ quality/
  guidance/
    retrieval/ capture/ processing/ ingestion/ client/ config/
```

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

`gate:all` runs the full multi-gate pipeline (coverage, changed-lines, quality, mutation-lite, traceability, escalation/integrity checks).

## Runtime behavior notes

- Hooks are **fail-open**: plugin errors are logged and do not crash host turns.
- Capture sanitization strips metadata wrappers, injected context markers, non-text assistant blocks, and reply directives before `stack/add`.
- `chatId` uses `sessionId` when present, else `sessionKey` (PM12).
- Assistant identity uses configured display names when available (PM13), else falls back to `ctx.agentId`.
- State files are stored under `stateDir` (default `.bonfires-state/`):
  - `capture-ledger.json`
  - `heartbeat-state.json`
  - `ingestion-hash-ledger.json`
  - `ingestion-cron-summary-current.json`

## Troubleshooting

- **Plugin not discovered**: run `openclaw plugins doctor`; verify `openclaw.plugin.json` and `openclaw.extensions` entry in `package.json`.
- **Unexpected mock client fallback**: verify `apiKeyEnv` target variable and `bonfireId`; use `strictHostedMode: true` to hard-fail.
- **No capture for an agent**: ensure that OpenClaw `ctx.agentId` exists in `config.agents`.
- **Ingestion profile mapping errors**: ensure profile names in `agentProfiles`/`defaultProfile` exist under `ingestion.profiles`.

## Specs and traceability

- Canonical index: `.ai/spec/spec/requirements-index.md`
- Traceability map: `.ai/spec/spec/quality/traceability-map.json`
- Test mapping: `tests/REQUIREMENT-MAPPING.md`
- Integration overview: `.ai/spec/BONFIRES-INTEGRATION-SPEC.md`

For architecture and requirement-level detail, start with the integration spec, then the unified requirements index.