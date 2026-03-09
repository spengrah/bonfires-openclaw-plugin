# Wave 9 Plan — PM16/PM17 (1C-A/B)

Date: 2026-03-08
Status: Plan phase (no implementation yet)

## Objectives
1. Define PM16/PM17 spec/guidance package with explicit approval model.
2. Revise the approval model to Option 1: turn-local approval-token mediation for executable ingestion.
3. Preserve responsiveness by avoiding blocking fetch/ingest in `before_agent_start`.
4. Gate implementation on PM14/PM15 production validation.

## Scope
- In scope:
  - PM16 approval-gated multi-link ingestion design
  - PM17 discovery + selected-set approval design (flagged)
  - verification/review support docs
- Out of scope:
  - PM16/PM17 code changes in this wave
  - Feature 2 retrieval tuning

## Preconditions (hard gate)
1. PM14 production install + smoke validation PASS
2. PM15 production install + safety validation PASS

### Precondition evidence (must be cited for kickoff)
1. `.ai/log/plan/pm14-pm15-production-validation-20260308.md` -> `GO` for live PM14/PM15 expected behavior.
2. `.ai/log/review/review-verification-quality-20260307w9-remediation.md` -> `GO`.
3. `.ai/log/review/review-correctness-20260307w9-remediation.md` -> `GO`.

## Deliverables (this wave)
1. Spec: `spec/spec/ingestion/approval-gated-link-ingestion-and-discovery.md`
2. Guidance: `spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`
3. Requirements index mapping update
4. Verification matrix + review support docs

## Risks to derisk before implementation
1. Latency regression from accidental heavy hook path.
2. Approval leakage (ingesting URLs not explicitly approved).
3. Missing approval provenance binding between approval and execution.
4. Drift from PM15 reusable safety path.
5. Feature-flag bypass for discovery.

## Option 1 remediation decision (locked)
1. Use a turn-local approval token as the executable handoff boundary for PM16/PM17.
2. `bonfires_ingest_links` must no longer trust caller-supplied raw approved URL lists as executable authority.
3. Discovery and user-provided-link approval flows may still present URLs to the model/user, but execution must be token-resolved server/tool-side.
4. Minimum enforcement scope for this remediation wave:
   - session-bound token resolution
   - turn-local provenance binding
   - rejection of missing/expired/unverifiable tokens
   - rejection of direct executable `urls` / raw `approvedUrls` bypass input
5. Review sequence after remediation remains fail-fast: Security/Attacker is the critical acceptance lens for this delta.

## Go/No-Go for implementation start
- GO only if:
  1) PM14/PM15 prod validation artifacts exist and pass,
  2) PM16/PM17 verification matrix is accepted,
  3) review checklist has no blockers.
