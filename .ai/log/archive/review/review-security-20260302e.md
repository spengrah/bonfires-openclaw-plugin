# Security Review — delta-20260302e

## 1) Verdict (GO|CONDITIONAL_GO|NO_GO)
CONDITIONAL_GO

## 2) Blocking findings
None.

## 3) Non-blocking findings
1. **Configurable `baseUrl` can widen outbound trust boundary (SSRF/exfiltration surface)**  
   - Evidence: `src/config.ts` keeps `baseUrl` configurable (`cfg.baseUrl`), and `src/bonfires-client.ts` uses it directly to build fetch targets in `fetchJson()` (`const url = `${this.cfg.baseUrl.replace(/\/$/, '')}${path}``).  
   - Risk: If plugin config can be influenced by an untrusted actor, requests (with bearer auth header) could be redirected to attacker-controlled hosts.

2. **Agent identifier not constrained before path use (low-to-medium robustness/security hygiene issue)**  
   - Evidence: `capture()`/`processStack()` call `/agents/${encodeURIComponent(req.agentId)}/...` without additional allowlist/shape validation beyond mapping lookup upstream.  
   - Risk: Encoding prevents path injection, but lack of explicit identifier policy weakens defense-in-depth and auditability.

## 4) Required remediation
1. Add host allowlisting for `baseUrl` in `parseConfig` (e.g., enforce HTTPS and approved Bonfires domains), or explicitly document/trust-boundary-lock config provenance.
2. Add explicit `agentId` format validation (expected charset/length) at client boundary before issuing network calls.
3. Optional hardening: include bounded network timeout/abort in hosted fetch calls to reduce hang-based degradation exposure.

## 5) delta.git_diff acknowledgement (yes/no)
yes
