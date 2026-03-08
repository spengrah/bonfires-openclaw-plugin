# Test-to-Requirement Mapping

Maps each test to its canonical requirement ID (R1–R6 from MVP, PM1–PM15 from post-MVP).
See `.ai/spec/spec/requirements-index.md` for the authoritative index.

## Wave 1 (wave1.test.ts)

- `before_agent_start calls search and returns prependContext` → R1
- `before_agent_start skips empty prompt` → R1
- `before_agent_start truncates query to 500 chars` → R1
- `before_agent_start caps prependContext at 2000 chars` → R1
- `before_agent_start fail-open on search error` → R1
- `before_agent_start skips unknown agent mapping` → R1, R5
- `extractUserMessage preserves normal json code blocks in user content` → PM11
- `extractUserMessage strips metadata wrappers but keeps trailing user json code block` → PM11
- `capture ledger persists injected sessions across restart when path is configured` → PM12

- `bonfires_search validates query and returns deterministic shape` → R2
- `bonfires_search clamps limit to max 50` → R2

- `agent_end captures every turn without throttle (PM10)` → R3, PM10
- `agent_end skips when sessionKey is missing` → R3, PM10

- `parseConfig rejects missing agent mappings` → R5
- `parseConfig validates numeric bounds` → R5
- `resolveBonfiresAgentId ignores inherited prototype keys` → R5

## Wave 2 (wave2-hosted.test.ts)

- `hosted search maps delve response to normalized results` → R6
- `hosted capture sends user+assistant pair with is_paired:true` → PM10
- `hosted capture pairs user+assistant and sends trailing single` → PM10
- `hosted capture single-message payload path` → PM10
- `hosted capture extracts text from array content blocks` → PM11
- `hosted capture skips messages with empty text content` → PM11
- `hosted capture message includes required stack/add fields` → PM11
- `hosted search parses JSON episode content and extracts inner content field` → R6
- `hosted search strips newlines from summaries` → R6
- `hosted search uses content/name fallbacks for summaries` → R6
- `hosted processStack hits process endpoint` → PM2
- `hosted ingestContent maps payload to ingest_content endpoint` → PM4
- `createBonfiresClient selects hosted when env+bonfire present` → R5
- `createBonfiresClient selects mock when env missing or bonfire missing` → R5
- `createBonfiresClient strictHostedMode throws when hosted env missing` → R5

## Wave 3 (wave3-heartbeat.test.ts)

- Recovery overlap precedence, close-timeout, retry policy → R4, PM2
- Recovery range helper, failure handling, startup behavior → R4, PM2

## Wave 6 (wave6-ingestion.test.ts)

- `wave6: ingestion skips unchanged content and persists ledger across runs` → PM4
- `wave6: changed content ingests exactly once per new hash and emits summary` → PM4
- `wave6: ingestContent error increments error count and records failure detail` → PM4
- `wave6: ingestion walker skips symlinked files outside root` → PM4
- `wave6: ingestion walker skips symlinked directories outside root` → PM4

## Wave 9 (wave9-pm12.test.ts)

- `before_agent_start injects on first message of session` → PM12
- `before_agent_start skips injection on subsequent messages` → PM12
- `before_agent_start re-injects for new sessionId` → PM12
- `before_agent_start marks injected even when search returns empty` → PM12
- `before_agent_start does not mark injected on search error` → PM12
- `before_agent_start works without sessionId (backward compat)` → PM12
- `before_agent_start works without ledger (backward compat)` → PM12
- `agent_end passes sessionId to capture` → PM12
- `session_end passes sessionId to capture` → PM12
- `hosted capture includes role and username in stack messages` → PM11
- `hosted capture uses sessionId as chatId when provided` → PM12
- `hosted capture falls back to sessionKey as chatId when sessionId absent` → PM12
- `hosted search passes agent_id to /delve` → R6
- `bonfires_stack_search validates query and returns results` → PM12
- `bonfires_stack_search rejects missing query` → PM12
- `bonfires_stack_search clamps limit to 1-100` → PM12
- `bonfires_stack_search returns empty for unknown agent` → PM12
- `bonfires_stack_search uses default limit of 10` → PM12
- `hosted stackSearch hits correct endpoint` → PM12
- `hosted stackSearch handles empty response` → PM12
- `capture ledger injection tracking is in-memory only` → PM12
- `plugin register registers bonfires_search, bonfires_stack_search, and bonfires_ingest_link tools` → PM12, PM15

## Wave 10 (wave10-pm13.test.ts)

- `handleAgentEnd passes agentDisplayName from deps` → PM13
- `handleAgentEnd falls back to ctx.agentId when no display name` → PM13
- `handleSessionEnd passes agentDisplayName from deps` → PM13
- `register passes agentDisplayNames from api.config to agent_end handler` → PM13
- `hosted capture uses agentDisplayName for assistant messages` → PM13
- `hosted capture falls back to agentId when no agentDisplayName` → PM13

## Wave 11 (wave11-pm14.test.ts)

- `pm14: isPdfExtension returns true for .pdf (case-insensitive)` → PM14
- `pm14: isPdfExtension returns false for non-PDF` → PM14
- `pm14: classifyRouteByPath routes .pdf to pdf and others to text` → PM14
- `pm14: isDuplicateResponse detects duplicate message (case-insensitive, tolerant)` → PM14
- `pm14: profile with .pdf extension routes PDFs to ingestPdf` → PM14
- `pm14: PDF with uppercase extension routes correctly` → PM14
- `pm14: duplicate PDF response counts as skipped, not error` → PM14
- `pm14: PDF ingest failure does not abort other files` → PM14
- `pm14: missing ingestPdf on client records error for PDF files` → PM14
- `pm14: non-PDF ingestion behavior unchanged (text path still works)` → PM14
- `pm14: successful PDF ingest updates ledger with hash` → PM14

## Wave 12 (wave12-pm15.test.ts)

- `pm15: classifyLink routes .pdf URL to pdf` → PM15
- `pm15: classifyLink routes text file URLs to text` → PM15
- `pm15: classifyLink routes .html URL to html` → PM15
- `pm15: classifyLink falls back to content-type when no extension` → PM15
- `pm15: classifyLink returns null for unsupported types` → PM15
- `pm15: classifyByContentType handles charset parameters` → PM15
- `pm15: isAllowedScheme accepts http and https only` → PM15
- `pm15: isPrivateHost blocks localhost and loopback` → PM15
- `pm15: isPrivateHost blocks private RFC1918 ranges` → PM15
- `pm15: isPrivateHost blocks link-local and metadata endpoints` → PM15
- `pm15: isPrivateHost allows public hosts` → PM15
- `pm15: validateFetchUrl rejects non-http schemes` → PM15
- `pm15: validateFetchUrl rejects private hosts` → PM15
- `pm15: validateFetchUrl accepts public https URLs` → PM15
- `pm15: extractReadableText strips script and style elements` → PM15
- `pm15: extractReadableText strips nav/header/footer/aside` → PM15
- `pm15: extractReadableText decodes HTML entities` → PM15
- `pm15: extractReadableText preserves paragraph structure` → PM15
- `pm15: extractReadableText handles empty/whitespace-only HTML` → PM15
- `pm15: extractReadableText normalizes excessive whitespace` → PM15
- `pm15: ingestLink rejects non-http URL` → PM15
- `pm15: ingestLink rejects localhost URL` → PM15
- `pm15: ingestLink rejects private IP URL` → PM15
- `pm15: ingestLink rejects metadata endpoint URL` → PM15
- `pm15: ingestLink result includes url, classification, route, success, duplicate` → PM15
- `pm15: isDuplicateResponse works for PM15 context` → PM15
- `pm15: bonfires_ingest_link tool registers with explicit description` → PM15
- `pm15: ingestLink PDF returns failure when ingestPdf resolves with success:false` → PM15
- `pm15: ingestLink PDF duplicate response is treated as success no-op` → PM15
- `pm15: isDuplicateResponse matches duplicate variants tolerantly` → PM15
- `pm15: safeFetch rejects redirect to private/blocked host` → PM15
- `pm15: safeFetch enforces maxRedirects hop limit at app layer` → PM15
- `pm15: safeFetch re-validates SSRF at intermediate redirect hop` → PM15
- `pm15: safeFetch follows valid redirects within hop limit` → PM15
- `pm15: ingestLink rejects URL that redirects to localhost` → PM15
- `pm15: ingestLink PDF "duplicate content" variant is treated as success no-op` → PM15
- `pm15: transport-safety DEFAULT_LIMITS includes maxRedirects` → PM15
- `pm15: bonfires_ingest_link is an explicit tool requiring user-approved invocation` → PM15
- `pm15: plugin registers bonfires_ingest_link tool` → PM15

## Requirements coverage

| ID | Description | Tests |
|----|------------|-------|
| R1 | Per-turn context retrieval (before_agent_start) | wave1 |
| R2 | On-demand bonfires_search tool | wave1 |
| R3 | Episodic capture (agent_end) | wave1 |
| R4 | Recovery catch-up + session-end flush | wave3 |
| R5 | Config validation + agent ID mapping | wave1, wave2 |
| R6 | Search response normalization (episodes + entities) | wave2, wave9 |
| PM2 | Stack processing heartbeat | wave2, wave3 |
| PM4 | Content ingestion via /ingest_content | wave2 |
| PM10 | Immediate stack capture (no throttle) | wave1, wave2 |
| PM11 | Capture message sanitization | wave2, wave9 |
| PM12 | Stack search + session improvements | wave9 |
| PM13 | Agent display names in stack messages | wave10 |
| PM14 | PDF ingestion routing | wave11 |
| PM15 | Linked content ingestion | wave12 |
