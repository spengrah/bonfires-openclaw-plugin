# Spec: Agent Display Names in Stack Messages

**ID:** PM13
**Status:** Implemented
**Depends on:** PM11 (capture message sanitization)

## Problem

Assistant messages sent to Bonfires via `stack/add` used the Bonfires agent ID (a MongoDB ObjectId like `69a51b279c462f4f06abe2f5`) as `userId` and `username`. This is not human-readable and leaks internal identifiers into the knowledge graph.

## Design

At plugin registration, build a display name map from OpenClaw's agent config:
```ts
const agentDisplayNames = {};
for (const a of (api.config?.agents?.list ?? [])) {
  if (a.id && a.name) agentDisplayNames[a.id] = a.name;
}
```

Resolution order for assistant `userId`/`username`:
1. `agentDisplayNames[ctx.agentId]` (e.g., "Lyle")
2. `ctx.agentId` (e.g., "main") — fallback, still more readable than ObjectId

The display name is passed from hooks to `capture()` via an `agentDisplayName` field on the request.

## Files modified
- `src/index.ts` — builds display name map from `api.config.agents.list`, passes to hook deps
- `src/hooks.ts` — resolves display name, passes to `capture()` in agent_end and session_end
- `src/bonfires-client.ts` — `capture()` accepts `agentDisplayName`, uses for assistant userId/username

## Acceptance criteria
- Assistant messages show "Lyle" (not ObjectId) as userId/username
- User messages still show sender name from metadata (e.g., "Spencer")
- Falls back to ctx.agentId when no name configured
- No changes to plugin config schema (uses OpenClaw agent config)
