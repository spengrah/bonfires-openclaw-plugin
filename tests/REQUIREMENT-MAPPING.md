# Test-to-Requirement Mapping (Wave 1)

- `before_agent_start calls search and returns prependContext` -> R1
- `before_agent_start skips empty prompt` -> R1
- `before_agent_start truncates query to 500 chars` -> R1
- `before_agent_start caps prependContext at 2000 chars` -> R1
- `before_agent_start fail-open on search error` -> R1
- `before_agent_start skips unknown agent mapping` -> R1/R5

- `bonfires_search validates query and returns deterministic shape` -> R2
- `bonfires_search clamps limit to max 50` -> R2

- `agent_end throttles per session` -> R3
- `agent_end skips when sessionKey is missing` -> R3

- `parseConfig rejects missing agent mappings` -> R5
- `parseConfig validates numeric bounds` -> R5
- `resolveBonfiresAgentId ignores inherited prototype keys` -> R5

R4 and R6 are not implemented in Wave 1 runtime behavior tests.
- R4: deferred to recovery/scheduler wave
- R6: validated at interface/spec level until Wave 2 hosted wiring
