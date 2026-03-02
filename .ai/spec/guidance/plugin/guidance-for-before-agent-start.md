# Guidance: before_agent_start (Reviewer Quality Criteria)

Reviewers should verify:
- Input handling quality: empty prompt short-circuit, 500-char truncation, and deterministic behavior under malformed input.
- Output quality: `prependContext` formatting matches spec fixture and remains <=2000 chars.
- Failure handling quality: retrieval faults are fail-open (no turn abort) with structured warning signal.
- Contract quality: hook payload assumptions align with SDK types and spec contract.
