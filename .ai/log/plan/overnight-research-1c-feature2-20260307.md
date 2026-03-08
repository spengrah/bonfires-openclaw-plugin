# Overnight Research — Feature 1C + Feature 2 (2026-03-07)

## Running changelog
- 2026-03-07 21:54 CST — Created research doc, mapped current architecture/code integration points, framed problem/assumptions.
- 2026-03-07 22:00 CST — Added option sets for Feature 1C and Feature 2 with tradeoffs and recommended direction.
- 2026-03-07 22:07 CST — Added security/risk model, verification/test strategy, phased rollout, external references, open questions, and executive summary.

## 2026-03-07 21:54 CST — Problem framing and assumptions

### Problem framing
Current plugin capabilities already cover baseline retrieval and ingestion: hooks (`src/hooks.ts`), search tools (`src/tools/bonfires-search.ts`, `src/tools/bonfires-stack-search.ts`), file/profile ingestion (`src/ingestion.ts`), and explicit link ingestion (`src/tools/bonfires-ingest-link.ts`).

Research target:
1. **Feature 1C** — agent-retrieved external content ingestion (safe, controllable, practical).
2. **Feature 2** — retrieval quality/control improvements in Bonfires + OpenClaw integration.

### Assumptions
1. Keep fail-open host-turn behavior, but tighten external ingestion safeguards.
2. Preserve existing wave-style `/dev` workflow and modular testability.
3. Bonfires API boundary remains `/delve`, `/stack/search`, `/ingest_content`, `/ingest_pdf`, `/stack/add`, `/stack/process`.
4. Explicit user approval remains default for external ingestion actions.

## 2026-03-07 21:54 CST — Integration points in current codebase

### Feature 1C touchpoints
- `src/tools/bonfires-ingest-link.ts` — current URL ingestion flow.
- `src/transport-safety.ts` — URL validation, SSRF controls, redirect/size/timeout limits.
- `src/html-extract.ts` — deterministic HTML-to-text extraction.
- `src/ingestion-core.ts` — route classification + duplicate-response helpers.
- `src/bonfires-client.ts` — hosted ingestion endpoints and retry behavior.

### Feature 2 touchpoints
- `src/hooks.ts` — `handleBeforeAgentStart` retrieval injection logic and context formatting.
- `src/tools/bonfires-search.ts` / `src/tools/bonfires-stack-search.ts` — retrieval controls and limits.
- `src/config.ts` — config boundary for future retrieval controls/profiles.
- `src/index.ts` — wiring for flags/profiles/tool registration.

## 2026-03-07 22:00 CST — Option set for Feature 1C (agent-retrieved external content ingestion)

### 1C-A: Expand explicit URL ingestion only
- Extend `bonfires_ingest_link` to support bounded `urls[]`, better metadata, clearer per-link status.
- **Pros:** lowest risk, high clarity, easy testability.
- **Cons:** no source discovery support.

### 1C-B: Two-step discovery -> selected ingest
- Add discovery tool returning candidate links/snippets; ingest only explicitly selected links.
- **Pros:** better UX/throughput while preserving explicit approval boundary.
- **Cons:** added orchestration complexity.

### 1C-C: Autonomous bounded crawl
- Seed URL + depth/page budget + domain constraints.
- **Pros:** fastest bulk ingestion.
- **Cons:** highest SSRF/abuse/scope risk, hardest to govern.

### Recommendation (Feature 1C)
**Primary:** 1C-B as target pattern.  
**Immediate MVP:** 1C-A hardening first.  
**Defer:** 1C-C until stronger governance/rate controls are in place.

## 2026-03-07 22:00 CST — Option set for Feature 2 (retrieval quality/control)

### 2-A: Query rewrite + retrieval controls
- Add configurable rewrite/threshold/top-k/max-context behavior.
- Integration: `src/hooks.ts`, `src/config.ts`, search tools.
- **Pros:** fastest quality lift, low risk.
- **Cons:** bounded by backend ranking quality.

### 2-B: Hybrid retrieval merge (`/delve` + `/stack/search`)
- Merge processed + recent memory with deterministic dedupe/rerank.
- Integration: new `src/retrieval-merge.ts`, updates in hooks/tools.
- **Pros:** better recall for active/recent context.
- **Cons:** higher complexity + calibration burden.

### 2-C: Retrieval profiles (per-agent)
- Profile-driven retrieval policies (limits, thresholds, modes) by agent.
- Integration pattern mirrors ingestion profiles in `config.ts`.
- **Pros:** strong control and task-specific tuning.
- **Cons:** increased config complexity.

### Recommendation (Feature 2)
Implement in sequence: **2-A -> 2-B -> 2-C**.

## 2026-03-07 22:07 CST — Security and safety risks

### SSRF
- Residual risks despite current guards: DNS rebinding/TOCTOU, tricky redirect chains, resource exhaustion.
- Mitigation additions: stronger host canonicalization checks, strict redirect policy, ingestion rate/budget limits.

### Prompt-injection via external content
- External content may contain remote/indirect injection instructions.
- Mitigation additions: strict provenance labeling, retrieval sanitization, explicit instruction/data boundary in injected context.

### Privacy/data handling
- Risks: accidental ingestion of secrets/PII, sensitive query params in URLs, cross-agent leakage.
- Mitigation additions: URL/token redaction, source trust metadata, per-agent policy isolation.

### Abuse paths
- Spam ingestion, semantic poisoning of memory, cost amplification.
- Mitigation additions: quotas, trust-weighted retrieval, operational alerts/telemetry.

## 2026-03-07 22:07 CST — Verification strategy and test plan

1. **Unit tests**
   - `transport-safety` bypass/redirect/normalization edge cases.
   - `ingest-link` batch semantics + metadata redaction + duplicate behavior.
   - retrieval controls (rewrite, thresholds, merge ordering).
2. **Integration tests**
   - hybrid retrieval fallback when one endpoint fails.
   - profile resolution behavior per agent.
   - backward compatibility of config parsing and plugin wiring in `src/index.ts`.
3. **Security fixtures**
   - prompt-injection corpus for sanitization expectations.
   - SSRF bypass corpus (IP encodings, redirects, local/meta targets).
   - rate-limit/budget enforcement tests.

## 2026-03-07 22:07 CST — Phased implementation plan (MVP -> hardening)

1. **Phase 0 (prep):** retrieval config scaffolding + telemetry additions.
2. **Phase 1 (MVP):** 1C-A hardening + 2-A retrieval controls.
3. **Phase 2:** 2-B hybrid retrieval merge and quality metrics.
4. **Phase 3:** 2-C per-agent retrieval profiles + optional 1C-B discovery tool.
5. **Phase 4 (hardening):** stricter domain policy controls, anti-poisoning heuristics, quotas/alerts.

## 2026-03-07 22:07 CST — External references
1. OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
2. OWASP LLM Prompt Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
3. OpenAI Retrieval guide (query rewrite/filter/ranking controls): https://developers.openai.com/api/docs/guides/retrieval
4. Microsoft advanced RAG guidance: https://learn.microsoft.com/en-us/azure/developer/ai/advanced-retrieval-augmented-generation

## Open questions for Spencer (tomorrow)
1. Should source discovery (1C-B) ship now or after URL-ingestion hardening only?
2. Do we require domain allowlist at launch, or start with optional policy + telemetry?
3. Should hybrid retrieval be default-on or profile-gated?
4. Preferred observability output: logs only vs structured plan artifacts/metrics.

## Executive summary
- **Recommendation headline 1:** Build Feature 1C as explicit, confirmation-first ingestion with batching + metadata hardening; defer autonomous crawl.
- **Recommendation headline 2:** Improve retrieval in staged order: rewrite/threshold controls first, hybrid merge second, profile controls third.
- **Recommendation headline 3:** Prioritize security hardening around SSRF edge cases, prompt-injection containment, and ingestion abuse budgets.
- **Repo fit:** Proposed work maps cleanly to current modules (`config.ts`, `hooks.ts`, `tools/*`, `transport-safety.ts`, `ingestion-core.ts`) and existing test workflow.
