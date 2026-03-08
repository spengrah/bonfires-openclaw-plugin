# Guidance: bonfires_search Tool (Reviewer Quality Criteria)

Reviewers should verify:
- Input validation quality: schema enforcement for required query and bounded limit.
- Normalization quality: tool outputs deterministic `{results:[{summary,source,score}]}` shape.
- Error semantics quality: retriable vs non-retriable failures are distinguishable and non-crashing.
- Security quality: no secret leakage in logs/errors.
