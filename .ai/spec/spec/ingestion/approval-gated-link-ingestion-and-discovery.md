# Spec: PM16/PM17 — Approval-gated link ingestion (1C-A/B)

Status: Implemented and validated

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
   - on approval, agent must obtain a session-local approval token bound to the approved URL subset,
   - agent may then call ingestion only with that approval token.
3. Agent asks user for approval.
4. User approves a subset.
5. System/tooling issues a session-local approval token for exactly that approved subset.
6. Agent may use that approval within the same session.
7. Agent calls ingestion tool with the approval token.

## Canonical flow (discovery, PM17)
1. Agent/user invokes `discover_links` (feature-flagged).
2. Tool returns candidates with metadata (`title`, `url`, `snippet`, `contentTypeGuess`, `confidence`) and enough session-local provenance to later mint/resolve an approval token for that candidate set.
3. Agent asks for selected-set approval once.
4. On approval, system/tooling issues a session-local approval token bound to the selected approved subset and current session provenance.
5. Agent may use that approval later in the same session.
6. Agent calls `bonfires_ingest_links` with that approval token.

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
- `approvalToken: string` (required)

Derived execution contract:
- `approvalToken` must resolve to a session-local approval record bound to the current session and an exact approved URL subset.
- The resolved approved URL subset is the only executable ingest set.
- The tool must ingest exactly the normalized approved URL set resolved from the token and must not accept an independent executable `urls` field or caller-supplied `approvedUrls` payload.
- Empty approved sets are invalid for execution.
- If approval is absent, expired, cross-session, malformed, unverifiable, or internally inconsistent, the tool must reject the request without ingesting anything.
- Same-session reuse of an already approved URL set is allowed by policy.
- PM16 user-provided-link flow: the token-bound approved set is the subset of user-provided URLs explicitly approved by the user within the current session.
- PM17 discovery flow: the token-bound approved set is the selected discovery-candidate set explicitly approved by the user within the current session.

Output:
- `results: Array<{ url: string; route: string; success: boolean; duplicate: boolean; error?: string }>`
- `summary: { requested: number; ingested: number; duplicates: number; blocked: number; failed: number }`
@@
-2. **Approval-bound ingestion:** ingestion must be scoped to explicitly approved URLs.
+2. **Approval-bound ingestion:** ingestion must be scoped exactly to explicitly approved URLs; no unapproved or extra URL may enter execution.

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
4. Approval provenance must be tool-verifiable: caller assertions alone are insufficient.
5. Approval tokens must be session-bound and rejected when expired, unverifiable, or cross-session.
6. Exact-turn binding and single-use token consumption are not required for PM16/PM17 under the accepted product policy.

## Defaults (initial)
- max URLs per ingest run: 10
- per-URL timeout: 15s
- run timeout: 90s
- max redirects: 3
- snippet target: 160-240 chars

## Preconditions
- PM14 + PM15 production install and validation must pass before PM16/PM17 implementation starts.
- Required precondition evidence:
  - `.ai/log/plan/pm14-pm15-production-validation-20260308.md` must show **GO** for live PM14/PM15 expected behavior.
  - `.ai/log/review/review-verification-quality-20260307w9-remediation.md` must show `GO` for remediation verification coverage.
  - `.ai/log/review/review-correctness-20260307w9-remediation.md` must show `GO` for PM14/PM15 correctness after remediation.
