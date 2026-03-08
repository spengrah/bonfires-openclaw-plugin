# Spec: before_agent_start Retrieval

## Goal
Inject relevant Bonfires context before every LLM turn.

## SDK contract (provisional)
Hook receives:
- `event.prompt: string` — the user's current-turn input.
- `ctx.agentId?: string` — the mapped agent identifier.
- `ctx.sessionKey?: string` — session identifier.
- Return type: `{ prependContext?: string }` or `void`.

Source to validate during implementation: OpenClaw plugin SDK types in local install (`dist/plugin-sdk/plugins/types.d.ts`).

## Requirements
1. Hook runs on every turn and uses `event.prompt` as query.
2. If `event.prompt` is empty or whitespace-only, skip search and return no context.
3. If `event.prompt` exceeds 500 characters, truncate to first 500 characters for the search query.
4. Query is executed against Bonfires for the active mapped agent.
5. If results exist, return `prependContext` with stable heading and separators.
6. Total `prependContext` length is capped at 2000 characters; include as many complete results as fit.
7. If Bonfires errors or returns empty, return no context (graceful degradation).
8. No per-turn caching in MVP.

### prependContext format
```text
--- Bonfires context ---
- {summary} (source: {source}, relevance: {score})
- {summary} (source: {source}, relevance: {score})
---
```
Each result is one `- ` line. Omit results that would push total past 2000 characters.

## Acceptance
- Two distinct turns produce two distinct search calls from corresponding prompts.
- Hook failure does not abort turn execution.
- Empty prompt path performs no Bonfires call.
