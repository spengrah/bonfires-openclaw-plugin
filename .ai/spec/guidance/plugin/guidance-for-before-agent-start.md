# Guidance: before_agent_start

- Import and use OpenClaw plugin SDK hook types directly to avoid payload-shape drift.
- Keep handler tiny: validate inputs, call client, format context, return.
- Enforce query truncation (500 chars), empty prompt short-circuit, and context cap (2000 chars).
- Keep prependContext format exactly aligned to spec fixture.
- Prefer hard timeout for Bonfires call and swallow/trace errors.
