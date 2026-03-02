# Spec — Plugin Packaging and OpenClaw Integration

## PM5 goal
Ship bonfires-plugin as a first-class OpenClaw plugin package with explicit config schema, install path, and runtime lifecycle conventions.

## Requirements

### PM5-R1 — Manifest + package discoverability
1. Plugin root MUST include `openclaw.plugin.json`.
2. Manifest MUST include `id: "bonfires-plugin"` and an inline `configSchema`.
3. `package.json` MUST include `openclaw.extensions` with the plugin entry file.
4. Config schema MUST set `additionalProperties: false` at all object boundaries unless explicitly justified.

### PM5-R2 — Config contract and env-friendly fallbacks
1. Config schema MUST include fields for `baseUrl`, `apiKeyEnv`, `bonfireId`, `agents`, `search`, `capture`, `network`, `strictHostedMode`, `ingestion`.
2. Runtime config parser MUST support env fallback behavior for:
   - `baseUrl` (fallback env, e.g. `BONFIRES_BASE_URL`)
   - `apiKeyEnv` (fallback env, e.g. `BONFIRES_API_KEY_ENV`)
   - `bonfireId` (fallback env, e.g. `BONFIRE_ID`)
3. Runtime MUST preserve current support for explicit config values overriding env fallbacks.
4. Sensitive values SHOULD be representable via env-only workflows (no plaintext required in `openclaw.json`).

### PM5-R3 — Heartbeat naming distinction
1. User-facing docs MUST clearly distinguish:
   - OpenClaw Gateway heartbeat (`agents.defaults.heartbeat`, `HEARTBEAT.md`)
   - Plugin stack-processing heartbeat (Bonfires processing/recovery loop)
2. Docs MUST include an explicit note about naming collision and scope boundaries.

### PM5-R4 — Plugin state persistence policy
1. Operational plugin state (ledgers, heartbeat state, ingestion summaries) MUST default to plugin-scoped state paths suitable for runtime operation.
2. Workspace planning artifacts under `.ai/log/plan` MUST NOT be the required long-term storage mechanism for end-user operation.
3. State paths MUST be configurable via plugin config.

### PM5-R5 — Lifecycle-managed background services
1. Long-running plugin loops (stack heartbeat, ingestion scheduler) SHOULD be registered through plugin lifecycle services where possible.
2. Startup and shutdown behavior MUST be deterministic (no orphan timers after plugin stop/reload).

### PM5-R6 — Install and operator usability
1. README MUST document install paths:
   - local link install (`openclaw plugins install -l <path>`)
   - npm install (`openclaw plugins install <npm-spec> --pin`)
2. README MUST include minimal `openclaw.json` config examples for plugin entry + config.
3. README MUST include an operator section for runtime diagnostics (status artifacts, verification command, common misconfig cases).
