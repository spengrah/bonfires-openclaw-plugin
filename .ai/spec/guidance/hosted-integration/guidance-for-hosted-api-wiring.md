# Guidance: Hosted API Wiring (Reviewer Quality Criteria)

Reviewers should verify:
- Adapter boundary quality: HTTP concerns isolated to client layer.
- Contract stability quality: normalized plugin-facing shapes unchanged by raw API variance.
- Operational quality: status-class error handling and fail-open behavior are explicit.
- Security quality: auth/secret handling is env-only with redacted logging.
- Verification quality: fixture/live probes exist for `/delve` and `/stack/add` mapping.
