# Spec: Bonfires Client Interface (Provisional)

Status: Provisional — update when Bonfires API docs are confirmed.

## Goal
Pin assumed request/response types so Wave 1 mocks and Wave 2 wiring share a stable boundary.

## Search endpoint (provisional)

Request:
```ts
interface SearchRequest {
  agentId: string;
  query: string;
  limit: number; // default: config.search.maxResults
}
```

Response:
```ts
interface SearchResponse {
  results: Array<{
    summary: string;
    source: string;
    score: number;
  }>;
}
```

## Capture endpoint (provisional)

Request:
```ts
interface CaptureRequest {
  agentId: string;
  sessionKey: string;
  messages: Array<{ role: string; content: string }>;
}
```

Response:
```ts
interface CaptureResponse {
  accepted: number; // count of messages ingested
}
```

## Error categories
- Retriable: network errors, HTTP 429, 502, 503, 504
- Non-retriable: HTTP 401 (auth), 400 (bad request), 404 (agent not found)
- HTTP 500: log and treat as retriable with backoff

## Open
- Confirm search returns `{summary, source, score}` tuples vs episode objects.
- Confirm `stack/process` accepts `{role, content}[]` directly.
- Confirm multiple `agentId` values per account.
