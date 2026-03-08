# AGENTS.md

OpenClaw plugin that connects agents to [Bonfires](https://bonfires.ai) for persistent episodic memory — retrieval, capture, and content ingestion.

## Quick reference

```
npm run test          # spec-lint + all tests
npm run lint          # spec-lint + tsc --noEmit
npm run gate:all      # all 9 verification gates (must pass before push)
npm run gate:traceability # spec/guidance/verification references resolve
npm run test:coverage # tests with c8 coverage output
```

## Source structure

```
src/
├── index.ts              # Plugin entry — register() wires hooks + tools
├── config.ts             # Config parsing + validation
├── hooks.ts              # before_agent_start, agent_end, session_end, before_compaction
├── bonfires-client.ts    # HostedBonfiresClient (API) + MockBonfiresClient (fallback)
├── capture-ledger.ts     # Watermark ledger (tracks what's been pushed per session)
├── heartbeat.ts          # Periodic stack/process + recovery tick
├── ingestion.ts          # File/doc ingestion cron
└── tools/
    ├── bonfires-search.ts       # bonfires_search tool (queries /delve)
    └── bonfires-stack-search.ts # bonfires_stack_search tool (queries stack/search)
```

## Test structure

Tests are organized in waves. Each file covers a feature area:

```
tests/
├── wave1.test.ts          # Core hooks, config, search tool
├── wave2-hosted.test.ts   # HostedBonfiresClient, message sanitization
├── wave3-heartbeat.test.ts # Heartbeat, recovery, retry
├── wave5-hosted-verification.test.ts
├── wave6-ingestion.test.ts
├── wave7-packaging.test.ts # Plugin manifest, schema, env fallbacks
├── wave8-profiles.test.ts  # Ingestion profiles
├── wave9-pm12.test.ts      # Stack search, session improvements
├── wave10-pm13.test.ts     # Agent display names
└── REQUIREMENT-MAPPING.md  # Maps every test to its canonical requirement ID
```

## .ai directory

```
.ai/
├── spec/
│   ├── BONFIRES-INTEGRATION-SPEC.md  # Top-level overview (start here for context)
│   ├── spec/                          # Feature specs organized by component
│   │   ├── requirements-index.md      # Unified index: R1-R6 + PM1-PM13
│   │   ├── retrieval/                 # before_agent_start, search tools
│   │   ├── capture/                   # Immediate capture, sanitization, display names
│   │   ├── processing/               # Heartbeat, recovery, compaction
│   │   ├── ingestion/                # Cron, profiles
│   │   ├── client/                   # API client, hosted wiring
│   │   ├── config/                   # Plugin config, packaging
│   │   └── quality/                  # Gates, traceability map, verification
│   └── guidance/                      # Implementation guidance (mirrors spec/ structure)
├── rules/                             # Agent behavior rules
├── pre-commit.json                    # Runs lint + test + gate:all on commit
├── pre-push.json                      # Runs lint + test + state check on push
└── log/                               # Gate reports, review logs, dogfood notes
```

### Specs and guidance

- **Specs** (`.ai/spec/spec/`) define *what must be true* — requirements, acceptance criteria.
- **Guidance** (`.ai/spec/guidance/`) defines *how to approach it* — reviewer criteria, implementation notes.
- Every spec file is organized by component (retrieval, capture, processing, etc.), not by project phase.
- **`requirements-index.md`** is the authoritative index mapping requirement IDs to spec files.

### Traceability

- **`quality/traceability-map.json`** maps every requirement (R1-R6, PM1-PM13) to its spec, guidance, and verification files.
- The `gate:traceability` gate validates that all referenced files exist.
- `tests/REQUIREMENT-MAPPING.md` maps every test name to its canonical requirement ID.

### Gates

`npm run gate:all` runs 9 gates in tiered order. All must pass.

| Tier | Gate | What it checks |
|------|------|----------------|
| 1 | `lint` | spec-lint (required files exist, no TODO/TBD) + tsc --noEmit |
| 2 | `test:coverage` | Full test suite with coverage |
| 2 | `gate:coverage` | Overall coverage thresholds |
| 2 | `gate:changed-lines` | Coverage on changed lines specifically |
| 3 | `gate:quality` | Quality heuristics |
| 3 | `gate:mutation-lite` | Lightweight mutation testing |
| 4 | `gate:traceability` | All traceability-map references resolve |
| X | `gate:diff-escalation` | Cross-cutting, policy/shape checks that can escalate review strictness based on change risk (non-linear, not part of the strict 1→4 progression) |
| X | `gate:anti-gaming` | Cross-cutting integrity checks for suspicious test/coverage patterns (non-linear, can trigger regardless of tier order) |

## OpenClaw plugin API

The plugin exports a `register(api)` function. Key API surface used:

```ts
api.on(hookName, handler)    // Register hook: 'before_agent_start', 'agent_end',
                             //   'session_end', 'before_compaction'
api.registerTool(factory)    // Register agent-callable tool (factory receives toolCtx)
api.pluginConfig             // Plugin config from openclaw.json
api.config                   // OpenClaw config (agents.list with {id, name}, etc.)
api.resolvePath(p)           // Resolve relative path to absolute
api.logger                   // Logger with .warn()
```

**Hook signatures:**
- `before_agent_start(event, ctx)` → `{ prependContext?: string } | void`
  - `event.prompt` = user's message (wrapped with OpenClaw metadata)
  - `ctx.agentId`, `ctx.sessionId`, `ctx.sessionKey`
- `agent_end(event, ctx)` → `void`
  - `event.messages` = full transcript array
- `session_end(event, ctx)` → `void`
- `before_compaction(event, ctx)` → `void`

**Tool factory:**
```ts
api.registerTool((toolCtx) => ({
  name: 'tool_name',
  parameters: { type: 'object', properties: {...}, required: [...] },
  execute: async (toolCallId, params) => ({ content: [...], details: ... }),
}))
```

**OpenClaw source reference:** The plugin SDK lives in the OpenClaw repo at `src/plugin-sdk/index.ts`.

## Bonfires API

Base URL: `https://tnt-v2.api.bonfires.ai/`
Auth: `Authorization: Bearer <DELVE_API_KEY>`

| Endpoint | Purpose |
|----------|---------|
| `POST /delve` | Search knowledge graph (episodes + entities) |
| `POST /agents/{id}/stack/add` | Push messages to stack (paired or single) |
| `POST /agents/{id}/stack/process` | Extract episodes from queued stack messages |
| `POST /agents/{id}/stack/search` | Search unprocessed stack messages |
| `POST /ingest_content` | Ingest file/doc content |

Full API contract: `.ai/spec/spec/client/bonfires-client-interface.md`

## Key conventions

- **All hooks are fail-open.** Errors are caught and logged, never crash the host.
- **Never log secrets.** Use `logger.warn()` for structured warnings only.
- **Immediate capture (PM10).** Every `agent_end` pushes to `stack/add` with no throttling. `stack/process` runs on the heartbeat (configurable via `processing.intervalMinutes`, default 20min).
- **Message sanitization (PM11).** User messages: strip metadata wrappers + prepend context, extract sender name. Assistant messages: strip thinking/toolCall blocks, strip `[[directive]]` prefixes.
- **Agent display names (PM13).** Built from `api.config.agents.list` at registration time, passed through hooks to `capture()`. Falls back to `ctx.agentId`.
- **First-message-only injection (PM12).** `before_agent_start` only queries Bonfires on the first message of each session.

## Common tasks

**Add a new hook:** Wire in `index.ts` via `api.on(name, handler)`, implement in `hooks.ts`, add tests, update `REQUIREMENT-MAPPING.md`.

**Deploy changes:** OpenClaw uses jiti for TypeScript transpilation with a cache at `/tmp/jiti/`. After modifying plugin source, clear the jiti cache and restart the OpenClaw gateway for changes to take effect.

**Run a single test file:** `npx tsx --test tests/wave1.test.ts`
