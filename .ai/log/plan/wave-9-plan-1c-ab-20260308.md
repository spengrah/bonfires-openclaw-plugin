# Wave 9 Plan — PM16/PM17 (1C-A/B)

Date: 2026-03-08
Status: Plan phase (no implementation yet)

## Objectives
1. Define PM16/PM17 spec/guidance package with explicit approval model.
2. Preserve responsiveness by avoiding blocking fetch/ingest in `before_agent_start`.
3. Gate implementation on PM14/PM15 production validation.

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

## Deliverables (this wave)
1. Spec: `spec/spec/ingestion/approval-gated-link-ingestion-and-discovery.md`
2. Guidance: `spec/guidance/ingestion/guidance-for-approval-gated-link-ingestion-and-discovery.md`
3. Requirements index mapping update
4. Verification matrix + review support docs

## Risks to derisk before implementation
1. Latency regression from accidental heavy hook path.
2. Approval leakage (ingesting URLs not explicitly approved).
3. Drift from PM15 reusable safety path.
4. Feature-flag bypass for discovery.

## Go/No-Go for implementation start
- GO only if:
  1) PM14/PM15 prod validation artifacts exist and pass,
  2) PM16/PM17 verification matrix is accepted,
  3) review checklist has no blockers.
