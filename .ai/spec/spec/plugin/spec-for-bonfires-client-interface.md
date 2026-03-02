# Spec: Bonfires Client Interface (Wave 2 concrete contract)

Status: Concrete pre-implementation contract for hosted Bonfires API wiring.

Base URL:
- `https://tnt-v2.api.bonfires.ai/`

Auth:
- Preferred: `Authorization: Bearer <DELVE_API_KEY>`
- Legacy fallback: `X-API-Key: <key>`

Required env:
- `DELVE_API_KEY`
- `BONFIRE_ID`

## Goal
Define exact request/response adapter behavior for Wave 2:
1. Pre-turn retrieval via `/delve`
2. Post-turn capture via `/agents/{agent_id}/stack/add`
3. Periodic processing via `/agents/{agent_id}/stack/process`

---

## 1) Retrieval contract — POST /delve

Endpoint:
- `POST /delve`

Request:
```ts
interface DelveRequest {
  query: string;                 // required
  bonfire_id: string;            // required
  agent_id?: string;             // optional, recommended
  num_results?: number;          // optional, default from plugin config
}
```

Canonical payload template:
```json
{
  "query": "<current user prompt>",
  "bonfire_id": "<BONFIRE_ID>",
  "agent_id": "<BONFIRES_AGENT_ID>",
  "num_results": 5
}
```

Raw response may include `episodes`, `entities`, `edges`, `graph_id`, etc.

Plugin-normalized response:
```ts
interface SearchResponse {
  results: Array<{
    summary: string;
    source: string;
    score: number;
  }>;
}
```

Adapter mapping policy:
- Prefer episode summaries/content for `summary`
- Use stable endpoint-derived source references for `source`
- Map confidence/relevance-like fields to `score`; if absent, use deterministic fallback ranking

---

## 2) Capture contract — POST /agents/{agent_id}/stack/add

Endpoint:
- `POST /agents/{agent_id}/stack/add`

Wave 2 canonical mode: **single-message posts** (one request per message).

Single-message request:
```ts
interface StackAddSingleRequest {
  message: {
    text: string;
    userId: string;
    chatId: string;
    timestamp: string; // ISO-8601
  };
}
```

Paired-turn payload mode is acknowledged by API but **deferred** (not required in Wave 2 acceptance).

Plugin capture mapping:
- Convert Wave payload `messages: Array<{role, content}>` into Bonfires stack message objects.
- Post each message individually to avoid loss across large uncaptured slices.
- `chatId` maps from OpenClaw `sessionKey`.
- `userId` maps by role (`user`/`assistant`).

Response (raw):
```ts
interface StackAddResponse {
  success: boolean;
  message_ids?: string[];
  message_count?: number;
  stack_count?: number;
}
```

Plugin-normalized capture response:
```ts
interface CaptureResponse {
  accepted: number; // derived from added messages count
}
```

---

## 3) Processing contract — POST /agents/{agent_id}/stack/process

Endpoint:
- `POST /agents/{agent_id}/stack/process`

Purpose:
- Convert queued stack messages into episodic memory records.

Cadence policy:
- Trigger every 15–20 minutes for active agents/sessions.

Raw response:
```ts
interface StackProcessResponse {
  success: boolean;
  message_count?: number;
  episode_id?: string | null;
  warning?: boolean;
  warning_message?: string | null;
  time_remaining_seconds?: number;
}
```

---

## 4) Verification read contract — POST /knowledge_graph/agents/{agent_id}/episodes/search

Endpoint:
- `POST /knowledge_graph/agents/{agent_id}/episodes/search`

Use for integration verification after capture/process:
```json
{
  "limit": 20,
  "after_time": "<ISO timestamp>"
}
```

---

## Error policy
- Retriable: network errors, HTTP 429, 502, 503, 504, transient 500
- Non-retriable: HTTP 400, 401, 403, 404 (unless async-job registration grace applies)
- 422: payload/schema issue; log details and fail operation (non-crash)

## Hook behavior policy
- All hook integrations are fail-open (never crash host flow)
- Structured warning logs only; never log secrets

## Wave 2 merge checklist
1. `/delve` adapter outputs normalized `SearchResponse` reliably.
2. `/stack/add` adapter handles single + paired payload modes.
3. `/stack/process` heartbeat execution path exists and is idempotent-safe.
4. End-to-end verify with `/episodes/search` for captured messages.
5. Auth headers and error handling validated in integration tests.
