# Review — Security/Attacker (Wave 9 Remediation)

- tz_id: `tz:reviewer:bonfires-plugin`
- lens: `Security/Attacker`
- delta: `.ai/log/review/diff-wave-9-remediation-38b0bc0.patch`
- commit range: `929ffec..38b0bc0`

## Findings
1. Transport hardening improved materially:
   - disallowed scheme rejection remains
   - SSRF target checks on initial URL remain
   - redirect targets are revalidated at each hop
   - deterministic redirect-hop limit enforcement added
2. Size + timeout bounds remain in fetch path.
3. Fail-open behavior remains item-scoped (no global ingestion abort introduced).

## Residual risk (tracked, not blocking)
- Duplicate-message matching remains intentionally conservative. If API duplicate semantics expand, benign false negatives may occur (treated as non-duplicate), but this does not create SSRF/RCE/exfiltration exposure.

## Verdict
`GO`
