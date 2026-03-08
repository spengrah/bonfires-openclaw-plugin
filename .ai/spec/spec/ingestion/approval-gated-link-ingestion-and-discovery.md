# Spec: PM16/PM17 — Approval-gated link ingestion (1C-A/B)

Status: Planning (pre-implementation)

## Scope
Define Feature 1C-A/B behavior with explicit user approval, non-blocking turn latency, and reuse-first architecture.

- **PM16 (1C-A):** Multi-link ingestion + approval contract for user-provided links.
- **PM17 (1C-B):** Link discovery + selected-set approval flow, behind feature flag until PM16 is production-validated.

## Product decisions (locked)
1. Build PM16 and PM17 now; PM17 is feature-flagged at runtime.
2. Approval mode for discovery flow: **approve selected set once**.
3. Discovery scope: open web.
4. Discovery ranking: relevance-only.
5. Do not block first-token latency with heavy fetch/ingest in `before_agent_start`.
6. Before implementing PM16/PM17, complete PM14/PM15 production install + validation.

## Canonical flow (user-provided links)
1. User sends message with link(s).
2. `before_agent_start` detects link presence and injects compact guidance:
   - agent may fetch/analyze link content per existing policy for user task,
   - agent must ask explicit ingestion approval before Bonfires ingestion,
   - on approval, call ingestion tool only for approved URLs.
3. Agent asks user for approval.
4. User approves.
5. Agent calls ingestion tool.

## Canonical flow (discovery, PM17)
1. Agent/user invokes `discover_links` (feature-flagged).
2. Tool returns candidates with metadata (`title`, `url`, `snippet`, `contentTypeGuess`, `confidence`).
3. Agent asks for selected-set approval once.
4. On approval, agent calls `bonfires_ingest_links` with selected URLs.

## Tool contracts

### `discover_links` (generic)
Input:
- `query: string` (required)
- `maxCandidates?: number` (default 10, max 25)

Output:
- `results: Array<{ title?: string; url: string; snippet?: string; contentTypeGuess?: string; confidence?: number }>`
- `count: number`

Notes:
- Generic naming is intentional; logic is not Bonfires-specific.
- Snippet target length: short budget (~160-240 chars).

### `bonfires_ingest_links` (Bonfires-specific sink)
Input:
- `urls: string[]` (required, max 10 default policy)
- `approvalContext?: { approvedByUser: boolean; approvedUrls?: string[] }`

Output:
- `results: Array<{ url: string; route: string; success: boolean; duplicate: boolean; error?: string }>`
- `summary: { requested: number; ingested: number; duplicates: number; blocked: number; failed: number }`

## Behavioral requirements
1. **Non-blocking hook behavior:** `before_agent_start` must only add guidance/instructions; no heavy network ingestion there.
2. **Approval-bound ingestion:** ingestion must be scoped to explicitly approved URLs.
3. **Idempotent duplicate handling:** duplicate content is success/no-op, not failure.
4. **Reuse-first implementation:** PM15 transport safety and ingestion core must be reused.
5. **Feature flag for PM17:** discovery must not be callable when flag is off.

## Safety requirements
1. Keep PM15 SSRF protections (scheme, private-host blocking, redirect hop controls).
2. Treat fetched/discovered content as untrusted data.
3. Enforce bounded limits (urls per run, size, timeout, redirects).

## Defaults (initial)
- max URLs per ingest run: 10
- per-URL timeout: 15s
- run timeout: 90s
- max redirects: 3
- snippet target: 160-240 chars

## Preconditions
- PM14 + PM15 production install and validation must pass before PM16/PM17 implementation starts.
