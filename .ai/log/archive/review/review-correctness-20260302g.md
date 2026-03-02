# Correctness Review — delta-20260302g

## 1) Verdict (GO|CONDITIONAL_GO|NO_GO)
CONDITIONAL_GO

## 2) Blocking findings
- **Spec/implementation mismatch risk (capture payload mode):** The updated client interface/spec text introduces both single-message and paired-turn capture request modes, but `HostedBonfiresClient.capture` currently posts only single-message payloads in a loop (`message` object only; no `messages` + `is_paired` path). If downstream behavior requires paired mode semantics, current implementation may be incomplete for that requirement.

## 3) Non-blocking findings
- `createBonfiresClient` chooses hosted vs mock at registration time based on env presence; this is deterministic and tested, but means late env injection during runtime will not switch client mode.
- Error handling in `fetchJson` is fail-fast and safe, but non-OK errors discard response-body detail; this reduces diagnosability rather than correctness.

## 4) Required remediation
1. Clarify and enforce capture contract: either
   - implement paired-turn payload mode (`messages` + `is_paired`) when appropriate, **or**
   - explicitly narrow spec/checklist language to single-message posting semantics and document why this is sufficient.
2. Add a targeted test that proves whichever capture-mode contract is intended (single-only vs mixed single/paired) so future regressions are caught.

## 5) delta.git_diff acknowledgement (yes/no)
yes
