# PM14/PM15 Production Validation — 2026-03-08

## Scope
Live production install/verification of PM14/PM15 behavior for bonfires-plugin, with emphasis on functional outcomes rather than unit-only evidence.

## Environment
- Repo: `projects/bonfires-plugin`
- Branch: `main`
- Install path: local plugin link install
- Bonfires base URL: `https://tnt-v2.api.bonfires.ai/`

## Install + baseline checks
1. `openclaw plugins install -l /home/lyle/.openclaw/workspace/projects/bonfires-plugin` → success
2. `openclaw plugins doctor` → `No plugin issues detected.`
3. `openclaw gateway status` → RPC probe OK
4. Tests: `node --import tsx --test tests/wave11-pm14.test.ts tests/wave12-pm15.test.ts` → pass
5. Full gates: `npm run gate:all` → pass

## Live functional evidence summary

### PM15 safety block behavior
- Test URL: `http://localhost:8080/test`
- Observed tool result shape:
  - `classification: "blocked"`
  - `route: "none"`
  - `success: false`
  - `error: "private/localhost targets are blocked"`
- Interpretation: expected private-target/localhost block enforced.

### PM15 PDF routing behavior
- Test URL: `https://arxiv.org/pdf/2509.10147v1.pdf`
- Observed tool result shape:
  - `classification: "pdf"`
  - `route: "/ingest_pdf"`
  - `success: true`
  - `duplicate: false`
- Interpretation: expected deterministic PDF route to `/ingest_pdf` works.

### PM14 ingestion run evidence
- Manual one-off ingestion summary reported:
  - `scanned: 508`
  - `ingested: 12`
  - `skipped: 473`
  - `errors: 23`
- Ledger evidence includes pushed hash for `lyle:vault/cosean-singularity.pdf`.

## Known non-blocking warnings
- Intermittent Bonfires `HTTP 503` observed on some attempts.
- One `HTTP 422` observed in a PDF attempt.
- These were intermittent and coexisted with successful PM14/PM15 runs.

## GO/NO-GO
- **GO** for PM14/PM15 expected behavior, with caveat:
  - Treat upstream `503` as transient availability risk requiring retries/monitoring.

## Follow-up recommendations
1. Keep 1C-B behind feature flag until additional production soak confirms stability under real traffic.
2. Add explicit retry/backoff guidance for `503` in operator runbook.
3. Preserve evidence-first transcript/tool-result reconciliation in future validation reports.
