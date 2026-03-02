# Spec: Plugin Config + Agent Mapping

## Goal
Provide deterministic runtime configuration for Bonfires integration.

## Requirements
1. Config includes `baseUrl`, env-backed API key, `search`, `capture`, and `agents` map.

### Config shape (provisional)
```ts
interface BonfiresPluginConfig {
  baseUrl: string;
  apiKeyEnv: string;                  // env var name, e.g. BONFIRES_API_KEY
  search: { maxResults: number };     // default: 5
  capture: { throttleMinutes: number }; // default: 15
  agents: Record<string, string>;     // { lyle: "...", reviewer: "..." }
}
```

2. Agents map includes `lyle` and `reviewer` Bonfires IDs.
3. Unknown `ctx.agentId` handling: log a warning and skip the Bonfires call for that invocation. Do not fall back to a default agent ID. Non-fatal — the turn or tool call proceeds without Bonfires involvement.
4. Secrets are loaded from env; not hardcoded in spec/runtime config files.

## Acceptance
- Config parse succeeds with required fields.
- Mapping resolves both required agents.
