# Correctness Review — delta-20260302f

## 1) Verdict (GO|CONDITIONAL_GO|NO_GO)
NO_GO

## 2) Blocking findings
1. **`baseUrl` host validation is bypassable and accepts non-Bonfires domains.**
   - **Evidence:** `src/config.ts` uses `parsed.hostname.endsWith('bonfires.ai')`.
   - **Why blocking:** This accepts `https://evilbonfires.ai/`, which is not a Bonfires-controlled subdomain but still passes validation. That can route API traffic (including bearer auth headers) to unintended hosts.
   - **Repro:**
     - Command: `node --import tsx -e "import {parseConfig} from './src/config.ts'; try{const o=parseConfig({agents:{lyle:'a',reviewer:'b'},baseUrl:'https://evilbonfires.ai/'}); console.log('accepted',o.baseUrl);}catch(e){console.error('rejected',e.message)}"`
     - Result: `accepted https://evilbonfires.ai/`

## 3) Non-blocking findings
1. **Search score mapping does not yet use response-provided relevance/confidence values when present.**
   - **Evidence:** `src/bonfires-client.ts` computes score by index (`1 - i*0.05`, `0.8 - i*0.05`) rather than reading any score/confidence fields from episode/entity objects.
   - **Impact:** Output shape is valid and deterministic, but this underuses potentially better ranking signal from upstream.

## 4) Required remediation
1. Fix host allowlist logic in `parseConfig`:
   - Require either exact `bonfires.ai` or subdomain boundary match: `hostname === 'bonfires.ai' || hostname.endsWith('.bonfires.ai')`.
   - Add regression tests that **reject** `evilbonfires.ai` and **accept** `tnt-v2.api.bonfires.ai`.
2. (Non-blocking but recommended) Update hosted search adapter to prefer upstream relevance/confidence score fields when available, with deterministic fallback only when absent.

## 5) delta.git_diff acknowledgement (yes/no)
yes
