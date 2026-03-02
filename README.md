# bonfires-openclaw-plugin

Bonfires integration plugin for OpenClaw.

## Overview
`bonfires-openclaw-plugin` connects OpenClaw agents to Bonfires memory so agents can retrieve and persist useful context during conversations.

The plugin is intended to improve continuity and recall by combining:
1. **Pre-turn retrieval** of relevant memory context.
2. **On-demand search** via an agent tool.
3. **Post-turn capture** of episodic conversation slices.

## Install

### Local link install (development)
```bash
openclaw plugins install -l /path/to/bonfires-plugin
```

### npm install (pinned version)
```bash
openclaw plugins install bonfires-plugin --pin
```

### Verify installation
```bash
openclaw plugins doctor
```

## Configuration

Add a `bonfires-plugin` entry to your `openclaw.json`:

```json
{
  "plugins": {
    "bonfires-plugin": {
      "agents": {
        "my-agent": "bonfires-agent-id-here"
      }
    }
  }
}
```

### Minimal env-only setup

All sensitive and deployment-specific values can be provided via environment variables, avoiding plaintext secrets in config files:

```bash
export BONFIRES_BASE_URL="https://tnt-v2.api.bonfires.ai/"
export BONFIRES_API_KEY_ENV="DELVE_API_KEY"   # name of the env var holding the key
export DELVE_API_KEY="your-api-key"            # the actual API key
export BONFIRE_ID="your-bonfire-id"
```

```json
{
  "plugins": {
    "bonfires-plugin": {
      "agents": { "my-agent": "bonfires-agent-id" }
    }
  }
}
```

### Config field reference

| Field | Type | Default | Env fallback | Description |
|---|---|---|---|---|
| `baseUrl` | string | `https://tnt-v2.api.bonfires.ai/` | `BONFIRES_BASE_URL` | Bonfires API base URL |
| `apiKeyEnv` | string | `DELVE_API_KEY` | `BONFIRES_API_KEY_ENV` | Name of env var holding the API key |
| `bonfireId` | string | `""` | `BONFIRE_ID` | Bonfire workspace ID |
| `agents` | object | _(required)_ | | Mapping of local agent IDs to Bonfires agent IDs |
| `search.maxResults` | number | `5` | | Max search results per query (min 1) |
| `capture.throttleMinutes` | number | `15` | | Min interval between captures per session (min 1) |
| `network.timeoutMs` | number | `12000` | | HTTP timeout in ms (min 1000) |
| `strictHostedMode` | boolean | `false` | | Throw if hosted credentials are missing |
| `stateDir` | string | `.bonfires-state` | | Directory for plugin runtime state files |
| `ingestion.enabled` | boolean | `false` | | Enable periodic content ingestion |
| `ingestion.everyMinutes` | number | `1440` | | Ingestion scan interval in minutes |
| `ingestion.rootDir` | string | `process.cwd()` | | Root directory for ingestion scan |
| `ingestion.ledgerPath` | string | `<stateDir>/ingestion-hash-ledger.json` | | Path for ingestion hash ledger |
| `ingestion.summaryPath` | string | `<stateDir>/ingestion-cron-summary-current.json` | | Path for ingestion run summary |

**Precedence**: explicit config value > environment variable fallback > built-in default.

## Intent
This plugin exists to make OpenClaw sessions more context-aware without requiring manual copy/paste memory workflows.

Design intent:
- Keep retrieval deterministic and bounded.
- Keep capture reliable and non-disruptive.
- Degrade gracefully (fail-open) when memory systems are unavailable.
- Preserve clear spec/guidance/verification artifacts in-repo.

## Core features
- Hook-based retrieval before agent turns (`before_agent_start`)
- Hook-based episodic capture after turns (`agent_end`)
- Session-end integration point (`session_end`)
- Stack-processing heartbeat runner (20-minute base cadence + jitter) with bounded retries
- Recovery/catch-up flow sharing capture watermark semantics with overlap-safe dedupe guards
- Hosted strict-mode guard to prevent silent mock fallback in non-dev hosted contexts
- Agent tool: `bonfires_search(query, limit?)`
- Agent mapping support for arbitrary agent IDs (project-specific names)
- Capture ledger for per-session throttling and incremental push behavior

## Heartbeat subsystem note

This plugin runs its own **stack-processing heartbeat** (20-minute cadence) for flushing captured conversation data through the Bonfires processing pipeline. This is distinct from the **OpenClaw Gateway heartbeat** (`agents.defaults.heartbeat` in Gateway config / `HEARTBEAT.md`), which is a platform-level liveness signal.

| Aspect | Plugin stack heartbeat | Gateway heartbeat |
|---|---|---|
| **Scope** | Bonfires plugin (this repo) | OpenClaw Gateway platform |
| **Purpose** | Trigger `processStack` for captured episodes | Platform agent liveness / keep-alive |
| **Cadence** | 20 min + 0-2 min jitter | Configured per-gateway |
| **Config** | Managed by plugin; state in `<stateDir>/heartbeat-state.json` | `agents.defaults.heartbeat` in Gateway config |
| **Failure signal** | `[heartbeat] process failed agent=...` in plugin logs | Gateway-level alerts |

If you see "heartbeat" in logs or config, check the source subsystem to determine which heartbeat is referenced. Plugin heartbeat log lines are prefixed with `[heartbeat]`.

## Plugin state

Runtime state files (heartbeat state, capture ledger, ingestion ledger/summary) are stored in a plugin-scoped directory, defaulting to `.bonfires-state/` relative to the plugin working directory. This is configurable via `stateDir` in plugin config.

State files:
- `<stateDir>/heartbeat-state.json` -- per-agent heartbeat attempt/success tracking
- `<stateDir>/capture-ledger.json` -- per-session capture watermarks
- `<stateDir>/ingestion-hash-ledger.json` -- content hash dedup ledger
- `<stateDir>/ingestion-cron-summary-current.json` -- last ingestion run summary

Planning artifacts under `.ai/log/plan/` are development-time workflow records and are not required for runtime operation.

## Repository layout
- `src/` -- plugin code
- `tests/` -- automated tests
- `.ai/spec/` -- feature specs and implementation guidance
- `.ai/log/` -- planning/review/readiness artifacts
- `scripts/` -- local verification/gate scripts
- `openclaw.plugin.json` -- OpenClaw plugin manifest

## Local commands
```bash
npm run lint
npm run test
npm run gate:all
npm run verify:hosted        # fixture-mode contract verification + artifact
npm run verify:hosted -- --live  # adds live preflight probes (requires env)
npm run ingest:bonfires      # run ingestion scan + hash-ledger update once
```

### Hosted verification output
- Report path: `.ai/log/plan/hosted-integration-verification-current.json`
- Report includes per-probe status and redacted config metadata (never prints API key values).

### Ingestion cron output
- Ledger path (default): `<stateDir>/ingestion-hash-ledger.json`
- Run summary path (default): `<stateDir>/ingestion-cron-summary-current.json`
- Ingestion is idempotent by content hash (`sha256:*`) and restart-safe via persisted ledger.

## Operator troubleshooting

### Common issues

**Plugin not discovered after install**
- Run `openclaw plugins doctor` to validate the manifest.
- Verify `openclaw.plugin.json` exists at the plugin root.
- Check that `package.json` includes the `openclaw.extensions.plugin` field.

**Missing API key / mock fallback**
- The plugin logs `Using MockBonfiresClient (missing env ...)` when credentials are not found.
- Ensure the env var named by `apiKeyEnv` (default `DELVE_API_KEY`) is set.
- Ensure `bonfireId` is set (config or `BONFIRE_ID` env).
- If `strictHostedMode: true`, missing credentials will throw instead of falling back.

**Agent mapping not found**
- Log lines `No bonfires agent mapping for <agentId>` indicate the local agent ID is not in the `agents` config map.
- Add a mapping entry: `"agents": { "<local-id>": "<bonfires-agent-id>" }`.

**Heartbeat failures**
- Check plugin logs for `[heartbeat] process failed agent=...`.
- Verify network connectivity to the Bonfires API (`baseUrl`).
- The heartbeat retries on HTTP 429/5xx with backoff; persistent failures increment `consecutive_failures` in heartbeat state.

**State directory permissions**
- Ensure the plugin process can read/write to the `stateDir` path.
- Default `.bonfires-state/` is created relative to the plugin working directory.

## Typical workflow
1. Update specs/guidance under `.ai/spec/` when behavior changes.
2. Implement changes in `src/`.
3. Add/adjust tests in `tests/` and requirement mapping docs as needed.
4. Run lint/tests locally.
5. Record review artifacts under `.ai/log/review/`.

## Notes
- `.ai/log/` is intentionally tracked for workflow provenance.
- Keep secrets out of repo and out of memory/log artifacts.
