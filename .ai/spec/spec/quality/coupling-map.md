# Plugin Coupling Map (MVP)

## Components
1. `index.ts` (plugin entry)
2. `bonfires-client.ts` (API boundary)
3. `capture-ledger.ts` (watermark + idempotency state)
4. `session-recovery.ts` (heartbeat/jsonl catch-up)
5. `config.ts` (env + runtime config parse)

## Couplings
- `index.ts` -> `config.ts`
- `index.ts` -> `bonfires-client.ts`
- `index.ts` -> `capture-ledger.ts`
- `index.ts` -> `session-recovery.ts`
- `session-recovery.ts` -> `capture-ledger.ts`
- `session-recovery.ts` -> transcript persistence paths (`~/.openclaw/agents/.../sessions/*.jsonl`)
- `bonfires-client.ts` -> Bonfires hosted HTTP API

## Guardrails
- Keep all Bonfires HTTP details isolated in `bonfires-client.ts`.
- Keep ledger mutation isolated in `capture-ledger.ts`.
- Hooks/tool should orchestrate only; avoid embedding business logic.
