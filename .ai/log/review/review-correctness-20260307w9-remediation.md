# Review — Correctness (Wave 9 Remediation)

- tz_id: `tz:reviewer:bonfires-plugin`
- lens: `Correctness`
- delta: `.ai/log/review/diff-wave-9-remediation-38b0bc0.patch`
- commit range: `929ffec..38b0bc0`

## Findings
1. PM15 PDF ingestion result semantics were fixed:
   - `ingestPdf` duplicate => success no-op
   - `ingestPdf` with `success:false` => explicit failure result
   - non-duplicate success path preserved
2. Redirect handling is now deterministic at app layer (`redirect: 'manual'` + explicit hop loop), with SSRF checks applied per hop.
3. Per-item failure isolation remains intact (link-level failures return structured failure without batch-fatal behavior).

## Residual assumptions (non-blocking)
1. Duplicate detection currently recognizes `duplicate` and `duplicate content` variants; broader phrase coverage (e.g., `already exists`) is not yet included.
2. Relative redirect parsing relies on URL resolution behavior; malformed Location headers fail the current item safely.

## Verdict
`GO`
