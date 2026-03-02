export function parseConfig(input) {
  const cfg = input ?? {};
  const maxResults = Number(cfg.search?.maxResults ?? 5);
  const throttleMinutes = Number(cfg.capture?.throttleMinutes ?? 15);
  if (!Number.isFinite(maxResults) || maxResults < 1) throw new Error('search.maxResults must be a finite number >= 1');
  if (!Number.isFinite(throttleMinutes) || throttleMinutes < 1) throw new Error('capture.throttleMinutes must be a finite number >= 1');
  const out = {
    baseUrl: String(cfg.baseUrl ?? 'https://api.bonfires.ai'),
    apiKeyEnv: String(cfg.apiKeyEnv ?? 'BONFIRES_API_KEY'),
    search: { maxResults },
    capture: { throttleMinutes },
    agents: cfg.agents ?? {},
  };
  if (!out.agents.lyle || !out.agents.reviewer) throw new Error('agents.lyle and agents.reviewer are required');
  return out;
}
export function resolveBonfiresAgentId(cfg, agentId) {
  if (!agentId) return null;
  if (!Object.hasOwn(cfg.agents, agentId)) return null;
  const val = cfg.agents[agentId];
  return typeof val === 'string' ? val : null;
}
