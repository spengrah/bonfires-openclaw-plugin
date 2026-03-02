# Correctness Review — delta-20260302e

## 1) Verdict (GO|CONDITIONAL_GO|NO_GO)
CONDITIONAL_GO

## 2) Blocking findings
- None identified from static diff review.

## 3) Non-blocking findings
1. **Hosted auth compatibility may be narrower than spec contract**
   - Evidence: `src/bonfires-client.ts` `headers()` sends only `Authorization: Bearer <key>`.
   - Spec delta states preferred bearer auth **plus legacy `X-API-Key` fallback**.
   - Risk: environments still requiring legacy header may fail hosted calls.

2. **`stack/add` implementation uses per-message single-post path only**
   - Evidence: `HostedBonfiresClient.capture()` loops `req.messages` and posts `{message: ...}` once per message.
   - Spec delta documents both single-message and paired-message payload variants.
   - Risk: correctness is fine for current behavior, but may underperform or diverge if backend expects/optimizes paired mode semantics.

3. **Process-stack hook exists at client layer but no scheduler evidence in this diff**
   - Evidence: `processStack()` added in `HostedBonfiresClient`; this delta does not show heartbeat/cadence wiring.
   - Risk: if Wave 2 expectation includes periodic processing, this patch alone does not prove end-to-end execution.

## 4) Required remediation
- Before merge to Wave-2-complete branch, confirm one of:
  - Implement legacy header fallback (`X-API-Key`) when needed, or
  - Explicitly de-scope legacy fallback in spec/docs and environment runbook.
- Decide and document capture mode policy:
  - either keep single-message posting as intentional canonical mode, or
  - add paired mode path/tests if required by backend contract.
- Add/point to explicit verification evidence for stack-processing cadence wiring (if in current wave scope).

## 5) delta.git_diff acknowledgement (yes/no)
yes
