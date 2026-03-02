# Spec: bonfires_search Tool

## Goal
Provide explicit, agent-invoked retrieval inside sessions.

## Requirements
1. Tool name: `bonfires_search`.
2. Signature: `query: string`, optional `limit: number`.
3. Response shape: `{ results: [{ summary, source, score }] }`.
4. Tool reuses Bonfires client and mapped agent resolution.
5. Tool errors are returned as tool failure payloads, not process crashes.

## Acceptance
- Valid call returns schema-compliant results array.
- Invalid inputs are rejected via schema validation.
