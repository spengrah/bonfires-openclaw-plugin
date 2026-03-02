# Guidance: Config + Mapping (Reviewer Quality Criteria)

Reviewers should verify:
- Config correctness quality: required fields and numeric bounds are validated.
- Mapping quality: explicit `lyle` + `reviewer` support and safe unknown-agent behavior.
- Secret hygiene quality: env indirection used; no secret persistence in repo artifacts.
- Robustness quality: prototype/inherited key lookups do not bypass mapping controls.
