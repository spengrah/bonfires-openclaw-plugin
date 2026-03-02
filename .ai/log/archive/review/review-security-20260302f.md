# Security Review — delta-20260302f

## 1) Verdict (GO|CONDITIONAL_GO|NO_GO)
NO_GO

## 2) Blocking findings
1. **Insufficient base URL host validation can allow API key exfiltration to attacker-controlled domains.**
   - **Evidence:** `src/config.ts` validates host with:
     - `if (!parsed.hostname.endsWith('bonfires.ai')) throw new Error('baseUrl host must be within bonfires.ai');`
   - **Issue:** `endsWith('bonfires.ai')` also accepts lookalike domains such as `evilbonfires.ai` (attacker-controlled), not just `bonfires.ai` or `*.bonfires.ai`.
   - **Impact:** Hosted client sends `Authorization: Bearer <DELVE_API_KEY>` to `baseUrl` in `HostedBonfiresClient.headers()` and `fetchJson(...)`; a malicious allowed host would receive the key.
   - **Severity:** High.

## 3) Non-blocking findings
1. **Legacy auth fallback documented in spec is not implemented.**
   - Spec mentions preferred Bearer with legacy `X-API-Key` fallback; code only sends `Authorization` header.
   - Not a direct vulnerability, but contract drift and potential operational confusion.

2. **Mock fallback in `createBonfiresClient` may mask deployment misconfiguration.**
   - Falls back to mock when env/key/bonfireId missing, with warning log only.
   - Security-adjacent risk: data capture/retrieval silently not happening where operators expected hosted mode.

## 4) Required remediation
1. **Fix host allowlist validation in `parseConfig`.**
   - Replace `endsWith('bonfires.ai')` check with strict domain-boundary logic, e.g.:
     - `hostname === 'bonfires.ai' || hostname.endsWith('.bonfires.ai')`
   - Keep `https` requirement.

2. **Add/keep tests that prove rejection of lookalike domains.**
   - Add explicit negative case for `https://evilbonfires.ai` (must reject).
   - Keep/expand positive cases for `https://bonfires.ai` and valid subdomain(s).

3. **(Recommended) Decide and codify auth behavior.**
   - Either implement legacy `X-API-Key` fallback or remove it from spec/docs to avoid ambiguity.

## 5) delta.git_diff acknowledgement (yes/no)
yes
