# Correctness Review — bonfires-plugin — Wave 8 rerun2 (PM6-R2 remediation)

## Diff acknowledgement
Reviewed commit `f7b28b8` via:
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/diff-wave-8-pm6-r2-remediation-f7b28b8.patch`

Compared against required context:
- Wave plan: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/wave-8-plan-20260303w8a.md`
- Verification matrix: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-matrix-wave-8-20260303w8a.md`
- Gate report: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-gates-report-current.json`
- Prior failing review: `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/review-correctness-20260303w8-rerun.md`
- PM6 spec/guidance:
  - `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/spec/spec/content-ingestion/ingestion-target-profiles-and-agent-mapping.md`
  - `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/spec/guidance/content-ingestion/guidance-for-ingestion-target-profiles-and-agent-mapping.md`

## Verdict
**GO**

## Confidence
**93/100**

## Summary
The PM6-R2 remediation is correctly wired and materially fixes the prior correctness failure mode (silent legacy fallback). The updated code now enforces explicit configuration errors when profile selectors are present without profiles, and propagates `defaultProfile` into runtime ingestion cron wiring so profile selection/failure semantics apply at runtime. I found no correctness defects at confidence 70+ in the remediated scope.

## Findings
### No blocking findings (>=70 confidence)
I did not identify logic/edge-case/spec-conformance defects in this remediation at reportable confidence.

## Acceptance criteria check (PM6-R2-focused)
- **PM6-R2.1 (agent→profile mapping supported): PASS**
  - Mapping remains parsed/validated in `src/config.ts` and consumed in ingestion runtime (`src/ingestion.ts`).
- **PM6-R2.2 (fallback to defaultProfile): PASS**
  - `defaultProfile` is now wired through plugin registration into cron runtime (`src/index.ts:34-50`, `src/ingestion.ts:304-326`) and used for profile resolution (`src/ingestion.ts:208-214`).
- **PM6-R2.3 (explicit failure, no silent hardcoded fallback): PASS**
  - Parse-time explicit failure if selectors are set but profiles missing (`src/config.ts:47-52`).
  - Runtime explicit failure when selectors are present but profiles missing (`src/ingestion.ts:192-197`).
  - Runtime explicit failure when resolved profile name does not exist (`src/ingestion.ts:216-219`).

## Edge cases considered
- `agentProfiles`/`defaultProfile` configured with no `profiles` defined (parse-time + runtime).
- `activeAgentId` mapped to missing profile name.
- `activeAgentId` mapped and default present (mapping precedence over default).
- `defaultProfile` only path with multiple profiles.
- Cron wiring path confirms selector inputs reach `runIngestionOnce`.

## required_before_merge
- None.

## verification_actions
- Static review of remediated diff and surrounding implementation in `src/config.ts`, `src/index.ts`, `src/ingestion.ts`.
- Static review of wave8 tests validating PM6-R2 explicit-failure and runtime wiring behavior.
- Verified gate report status includes passing wave8 tests covering remediation cases.

## Proof of review
### Files read
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/diff-wave-8-pm6-r2-remediation-f7b28b8.patch`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/wave-8-plan-20260303w8a.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-matrix-wave-8-20260303w8a.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/plan/verification-gates-report-current.json`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/log/review/review-correctness-20260303w8-rerun.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/spec/spec/content-ingestion/ingestion-target-profiles-and-agent-mapping.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/.ai/spec/guidance/content-ingestion/guidance-for-ingestion-target-profiles-and-agent-mapping.md`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/config.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/ingestion.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/src/index.ts`
- `/home/lyle/.openclaw/workspace/projects/bonfires-plugin/tests/wave8-profiles.test.ts`

### Commands run
- `nl -ba src/ingestion.ts | sed -n '175,255p'`
- `nl -ba src/index.ts | sed -n '28,70p'`
- `nl -ba src/config.ts | sed -n '38,85p'`
- `grep -RIn "activeAgentId\|defaultProfile\|agentProfiles" src tests/wave8-profiles.test.ts`

### Gate/test evidence consulted
- Gate report (`verification-gates-report-current.json`) shows PASS for lint/test/coverage/quality/mutation-lite/traceability and wave8 PM6-R2-related tests, including explicit new tests for:
  - selectors-without-profiles failure
  - runtime defaultProfile selection
  - active-agent mapping precedence
  - unresolved profile explicit failure
  - cron forwarding of `defaultProfile`/`activeAgentId`
