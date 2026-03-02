export function parseConfig(input) {
  const cfg = input ?? {};
  const maxResults = Number(cfg.search?.maxResults ?? 5);
  const throttleMinutes = Number(cfg.capture?.throttleMinutes ?? 15);
  if (!Number.isFinite(maxResults) || maxResults < 1) throw new Error('search.maxResults must be a finite number >= 1');
  if (!Number.isFinite(throttleMinutes) || throttleMinutes < 1) throw new Error('capture.throttleMinutes must be a finite number >= 1');
  const out = {
    baseUrl: String(cfg.baseUrl ?? 'https://tnt-v2.api.bonfires.ai/'),
    apiKeyEnv: String(cfg.apiKeyEnv ?? 'DELVE_API_KEY'),
    bonfireId: String(cfg.bonfireId ?? process.env.BONFIRE_ID ?? ''),
    search: { maxResults },
    capture: { throttleMinutes },
    agents: cfg.agents ?? {},
    network: { timeoutMs: Number(cfg.network?.timeoutMs ?? 12000) },
  };
  if (!out.agents.lyle || !out.agents.reviewer) throw new Error('agents.lyle and agents.reviewer are required');
  if (!Number.isFinite(out.network.timeoutMs) || out.network.timeoutMs < 1000) throw new Error('network.timeoutMs must be a finite number >= 1000');

  let parsed: URL;
  try { parsed = new URL(out.baseUrl); } catch { throw new Error('baseUrl must be a valid URL'); }
  if (parsed.protocol !== 'https:') throw new Error('baseUrl must use https');
  const h = parsed.hostname;
  if (!(h === 'bonfires.ai' || h.endsWith('.bonfires.ai'))) throw new Error('baseUrl host must be bonfires.ai or a subdomain');

  return out;
}
export function resolveBonfiresAgentId(cfg, agentId) {
  if (!agentId) return null;
  if (!Object.hasOwn(cfg.agents, agentId)) return null;
  const val = cfg.agents[agentId];
  return typeof val === 'string' ? val : null;
}
