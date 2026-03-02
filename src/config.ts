export function parseConfig(input) {
  const cfg = input ?? {};
  const maxResults = Number(cfg.search?.maxResults ?? 5);
  const throttleMinutes = Number(cfg.capture?.throttleMinutes ?? 15);
  if (!Number.isFinite(maxResults) || maxResults < 1) throw new Error('search.maxResults must be a finite number >= 1');
  if (!Number.isFinite(throttleMinutes) || throttleMinutes < 1) throw new Error('capture.throttleMinutes must be a finite number >= 1');
  const stateDir = String(cfg.stateDir ?? '.bonfires-state');

  const out = {
    baseUrl: String(cfg.baseUrl ?? process.env.BONFIRES_BASE_URL ?? 'https://tnt-v2.api.bonfires.ai/'),
    apiKeyEnv: String(cfg.apiKeyEnv ?? process.env.BONFIRES_API_KEY_ENV ?? 'DELVE_API_KEY'),
    bonfireId: String(cfg.bonfireId ?? process.env.BONFIRE_ID ?? ''),
    search: { maxResults },
    capture: { throttleMinutes },
    agents: cfg.agents ?? {},
    network: { timeoutMs: Number(cfg.network?.timeoutMs ?? 12000) },
    strictHostedMode: Boolean(cfg.strictHostedMode ?? false),
    stateDir,
    ingestion: {
      enabled: Boolean(cfg.ingestion?.enabled ?? false),
      everyMinutes: Number(cfg.ingestion?.everyMinutes ?? 1440),
      rootDir: String(cfg.ingestion?.rootDir ?? process.cwd()),
      ledgerPath: String(cfg.ingestion?.ledgerPath ?? `${stateDir}/ingestion-hash-ledger.json`),
      summaryPath: String(cfg.ingestion?.summaryPath ?? `${stateDir}/ingestion-cron-summary-current.json`),
    },
  };
  const mappedAgents = Object.entries(out.agents).filter(([, v]) => typeof v === 'string');
  if (!mappedAgents.length) throw new Error('agents must include at least one string mapping');
  if (!Number.isFinite(out.network.timeoutMs) || out.network.timeoutMs < 1000) throw new Error('network.timeoutMs must be a finite number >= 1000');
  if (!Number.isFinite(out.ingestion.everyMinutes) || out.ingestion.everyMinutes < 1) throw new Error('ingestion.everyMinutes must be a finite number >= 1');

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
