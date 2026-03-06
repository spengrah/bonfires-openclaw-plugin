# Guidance: prependContext Stripping (Reviewer Quality Criteria)

Reviewers should verify:
- Pattern correctness: the stripping regex/logic matches the exact `prependContext` format produced by `formatPrepend()` in `hooks.ts`. The format is:
  ```
  --- Bonfires context ---
  - {summary} (source: {source}, relevance: {score})
  ---
  ```
  The pattern should handle variable numbers of result lines (0 to N).
- Scope: stripping applies only to `role: "user"` messages in the capture path. Assistant messages must never be modified.
- Placement: stripping must happen in the capture/client layer, not in the hook event. The LLM must still receive the full prepended prompt for context.
- Edge cases:
  - Message with prependContext but no user text after it → skip entirely (don't send empty text to Bonfires).
  - Message with no prependContext prefix → pass through unchanged.
  - Message where `--- Bonfires context ---` appears mid-text (not at the start) → do not strip (only strip leading prefix).
  - Multiple prependContext blocks (theoretically impossible but defensive) → strip only the leading one.
- No false positives: if the user literally types `--- Bonfires context ---`, it would be stripped. This is acceptable — the marker is specific enough that false positives are negligible.
- Integration with existing `extractText()`: the stripping should compose cleanly with the existing content normalization in `bonfires-client.ts` (which handles array content blocks, JSON.stringify for objects, etc.).
