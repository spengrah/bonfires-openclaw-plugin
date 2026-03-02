# Plugin Verification Checklist (MVP)

## Pre-implementation gates
- [ ] `.ai/pre-commit.json` lint command is real and passing
- [ ] `.ai/pre-commit.json` test command is real and passing
- [ ] OpenClaw SDK types verified for `before_agent_start` payload fields (`event.prompt`, `ctx.agentId`)
- [ ] Recovery trigger confirmed: plugin-accessible heartbeat signal OR scheduled cron trigger available

## Feature acceptance gates (by requirement)
- [ ] **R1** before_agent_start calls search per turn with `event.prompt`
- [ ] **R1** empty prompt path performs no Bonfires call
- [ ] **R1** oversized prompt is truncated to 500 chars
- [ ] **R1** prependContext capped at 2000 chars
- [ ] **R1** failures degrade gracefully (no turn abort)

- [ ] **R2** `bonfires_search` validates input and returns deterministic schema
- [ ] **R2** tool limit clamps to configured safety bound

- [ ] **R3** `agent_end` throttles and pushes only uncaptured slices
- [ ] **R3** missing sessionKey path is non-fatal and skips capture

- [ ] **R4** recovery backfills missed ranges and avoids duplicates
- [ ] **R4** session-end flush works (hook-first, inactivity fallback)

- [ ] **R5** mapping resolves `lyle` and `reviewer`
- [ ] **R5** unknown agent mapping is non-fatal skip path
- [ ] **R5** config rejects invalid numeric bounds
- [ ] **R5** API key comes from env indirection (not checked into repo)

- [ ] **R6** provisional Bonfires client interface validated against hosted docs before Wave 2

## Exit criteria for implementation start
- [ ] Checklist reviewed after spec pressure test
- [ ] Open questions tracked with explicit owner and unblock condition
