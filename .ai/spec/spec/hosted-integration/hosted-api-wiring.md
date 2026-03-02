# Spec: Hosted API Wiring (Wave 2)

## Goal
Replace mock Bonfires client with hosted API integration while preserving Wave 1 behavioral contracts.

## Requirements
1. Base URL defaults to `https://tnt-v2.api.bonfires.ai/` and is config-overridable.
2. Auth uses `Authorization: Bearer <DELVE_API_KEY>`.
3. Retrieval maps to `POST /delve`.
4. Capture maps to `POST /agents/{agent_id}/stack/add`.
5. Client adapter normalizes hosted responses into repo contract types.
6. Hook/tool flows remain fail-open (no host-flow crashes on API failures).

## Acceptance
- Preflight checks pass using configured env.
- before_agent_start retrieves from `/delve` with mapped agent + bonfire.
- agent_end capture posts to `/stack/add` with expected message mapping.
- bonfires_search tool uses hosted retrieval path and returns normalized schema.
