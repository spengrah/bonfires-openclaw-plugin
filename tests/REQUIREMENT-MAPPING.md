# Test-to-Requirement Mapping

## Wave 1 (wave1.test.ts)

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

## Wave 2 (wave2-hosted.test.ts)

- `hosted search maps delve response to normalized results` -> R6
- `hosted capture sends user+assistant pair with is_paired:true` -> R3/R7
- `hosted capture pairs user+assistant and sends trailing single` -> R3/R7
- `hosted capture single-message payload path` -> R3
- `hosted capture extracts text from array content blocks` -> R8
- `hosted capture skips messages with empty text content` -> R8
- `hosted capture message includes required stack/add fields` -> R9
- `hosted search parses JSON episode content and extracts inner content field` -> R10
- `hosted search strips newlines from summaries` -> R10
- `hosted search uses content/name fallbacks for summaries` -> R6
- `hosted processStack hits process endpoint` -> R4
- `hosted ingestContent maps payload to ingest_content endpoint` -> R11
- `createBonfiresClient selects hosted when env+bonfire present` -> R5
- `createBonfiresClient selects mock when env missing or bonfire missing` -> R5
- `createBonfiresClient strictHostedMode throws when hosted env missing` -> R5

## Wave 3 (wave3-heartbeat.test.ts)

- Recovery overlap precedence, close-timeout, retry policy -> R4
- Recovery range helper, failure handling, startup behavior -> R4

## Requirements index

| ID | Requirement | Status |
|----|------------|--------|
| R1 | Per-turn context retrieval via before_agent_start | ✅ Implemented + tested |
| R2 | On-demand bonfires_search tool | ✅ Implemented + tested |
| R3 | Episodic capture via agent_end with throttling | ✅ Implemented + tested |
| R4 | Recovery catch-up + stack processing heartbeat | ✅ Implemented + tested |
| R5 | Config validation + agent ID mapping | ✅ Implemented + tested |
| R6 | Search response normalization (episodes + entities) | ✅ Implemented + tested |
| R7 | Paired message format (is_paired: true) | ✅ Implemented + tested |
| R8 | Content array normalization (extract text blocks) | ✅ Implemented + tested |
| R9 | stack/add message format (text, userId, chatId required) | ✅ Implemented + tested |
| R10 | Episode JSON content parsing + newline stripping | ✅ Implemented + tested |
| R11 | Content ingestion via /ingest_content | ✅ Implemented + tested |

R7–R11 were discovered during dogfood testing (2026-03-05).
