export type IngestionProfile = {
  rootDir: string;
  includeGlobs: string[];
  excludeGlobs: string[];
  extensions: string[];
};

const DEFAULT_EXCLUDE_GLOBS = ['**/node_modules/**', '**/.git/**', '**/.openclaw/**'];

export function parseConfig(input, opts?: { logger?: { warn?: (msg: string) => void } }) {
  const cfg = input ?? {};
  const maxResults = Number(cfg.search?.maxResults ?? 5);
  const intervalMinutes = Number(cfg.processing?.intervalMinutes ?? 20);
  if (!Number.isFinite(maxResults) || maxResults < 1) throw new Error('search.maxResults must be a finite number >= 1');
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) throw new Error('processing.intervalMinutes must be a finite number >= 1');
  const stateDir = String(cfg.stateDir ?? '.bonfires-state').trim() || '.bonfires-state';
  const discoveryEnabled = Boolean(cfg.discovery?.enabled ?? false);
  const discoveryMaxCandidates = Number(cfg.discovery?.maxCandidates ?? 10);
  if (!Number.isFinite(discoveryMaxCandidates) || discoveryMaxCandidates < 1 || discoveryMaxCandidates > 25) {
    throw new Error('discovery.maxCandidates must be a finite number between 1 and 25');
  }
  const ingestionApprovalMaxUrlsPerRun = Number(cfg.ingestion?.approval?.maxUrlsPerRun ?? 10);
  if (!Number.isFinite(ingestionApprovalMaxUrlsPerRun) || ingestionApprovalMaxUrlsPerRun < 1 || ingestionApprovalMaxUrlsPerRun > 10) {
    throw new Error('ingestion.approval.maxUrlsPerRun must be a finite number between 1 and 10');
  }

  // Parse ingestion profiles (PM6-R1)
  const profiles: Record<string, IngestionProfile> = {};
  let deprecationWarnings: string[] = [];

  if (cfg.ingestion?.profiles && typeof cfg.ingestion.profiles === 'object') {
    for (const [name, raw] of Object.entries(cfg.ingestion.profiles)) {
      if (!name || typeof name !== 'string') throw new Error('ingestion.profiles keys must be non-empty strings');
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`ingestion.profiles key "${name}" must be alphanumeric with hyphens/underscores only`);
      const p = raw as any;
      if (!p || typeof p !== 'object') throw new Error(`ingestion.profiles.${name} must be an object`);
      if (!p.rootDir || typeof p.rootDir !== 'string') throw new Error(`ingestion.profiles.${name}.rootDir is required and must be a string`);
      const includeGlobs = Array.isArray(p.includeGlobs) ? p.includeGlobs.filter((g: any) => typeof g === 'string') : ['**/*'];
      if (includeGlobs.length === 0) throw new Error(`ingestion.profiles.${name}.includeGlobs must include at least one glob`);
      const excludeGlobs = Array.isArray(p.excludeGlobs) ? p.excludeGlobs.filter((g: any) => typeof g === 'string') : [...DEFAULT_EXCLUDE_GLOBS];
      const extensions = Array.isArray(p.extensions) ? p.extensions.filter((e: any) => typeof e === 'string') : ['.md'];
      profiles[name] = { rootDir: p.rootDir, includeGlobs, excludeGlobs, extensions };
    }
  }

  // Agent-to-profile mapping (PM6-R2)
  const agentProfiles: Record<string, string> = {};
  if (cfg.ingestion?.agentProfiles && typeof cfg.ingestion.agentProfiles === 'object') {
    for (const [agentId, profileName] of Object.entries(cfg.ingestion.agentProfiles)) {
      if (typeof profileName !== 'string') throw new Error(`ingestion.agentProfiles.${agentId} must be a string profile name`);
      agentProfiles[agentId] = profileName;
    }
  }
  const defaultProfile: string | undefined = typeof cfg.ingestion?.defaultProfile === 'string' ? cfg.ingestion.defaultProfile : undefined;

  // Prevent silent fallback to legacy hardcoded collector when profile selectors are provided
  // without any defined profiles (PM6-R2 explicit configuration failures).
  const hasProfileSelectors = Object.keys(agentProfiles).length > 0 || Boolean(defaultProfile);
  if (hasProfileSelectors && Object.keys(profiles).length === 0) {
    throw new Error('ingestion.agentProfiles/defaultProfile requires at least one ingestion.profiles entry');
  }

  // Validate agent profile references point to existing profiles
  if (Object.keys(profiles).length > 0) {
    for (const [agentId, profileName] of Object.entries(agentProfiles)) {
      if (!profiles[profileName]) throw new Error(`ingestion.agentProfiles.${agentId} references unknown profile "${profileName}"`);
    }
    if (defaultProfile && !profiles[defaultProfile]) throw new Error(`ingestion.defaultProfile references unknown profile "${defaultProfile}"`);
  }

  // Legacy backward compatibility (PM6-R3):
  // If no profiles defined but legacy ingestion.rootDir is present, synthesize a profile
  const hasLegacyRootDir = cfg.ingestion?.rootDir !== undefined;
  const hasNewProfiles = Object.keys(profiles).length > 0;

  if (hasLegacyRootDir && !hasNewProfiles) {
    const legacyRoot = String(cfg.ingestion.rootDir);
    profiles['_legacy'] = {
      rootDir: legacyRoot,
      includeGlobs: ['**/*'],
      excludeGlobs: [...DEFAULT_EXCLUDE_GLOBS],
      extensions: ['.md'],
    };
    deprecationWarnings.push(
      `ingestion.rootDir is deprecated; migrate to ingestion.profiles for portable config`
    );
  }

  // PM18: system-context placement for stable guidance
  const systemGuidance: string | undefined =
    typeof cfg.retrieval?.systemGuidance === 'string' && cfg.retrieval.systemGuidance.trim()
      ? cfg.retrieval.systemGuidance.trim()
      : undefined;


  const out = {
    baseUrl: String(cfg.baseUrl ?? process.env.BONFIRES_BASE_URL ?? 'https://tnt-v2.api.bonfires.ai/'),
    apiKeyEnv: String(cfg.apiKeyEnv ?? process.env.BONFIRES_API_KEY_ENV ?? 'DELVE_API_KEY'),
    bonfireId: String(cfg.bonfireId ?? process.env.BONFIRE_ID ?? ''),
    search: { maxResults },
    processing: { intervalMinutes },
    agents: cfg.agents ?? {},
    network: { timeoutMs: Number(cfg.network?.timeoutMs ?? 12000) },
    strictHostedMode: Boolean(cfg.strictHostedMode ?? false),
    stateDir,
    retrieval: { systemGuidance },
    discovery: {
      enabled: discoveryEnabled,
      maxCandidates: discoveryMaxCandidates,
    },
    ingestion: {
      enabled: Boolean(cfg.ingestion?.enabled ?? false),
      everyMinutes: Number(cfg.ingestion?.everyMinutes ?? 1440),
      rootDir: String(cfg.ingestion?.rootDir ?? process.cwd()),
      ledgerPath: String(cfg.ingestion?.ledgerPath ?? `${stateDir}/ingestion-hash-ledger.json`),
      summaryPath: String(cfg.ingestion?.summaryPath ?? `${stateDir}/ingestion-cron-summary-current.json`),
      approval: {
        maxUrlsPerRun: ingestionApprovalMaxUrlsPerRun,
      },
      profiles,
      agentProfiles,
      defaultProfile,
      deprecationWarnings,
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

  // Emit deprecation warnings (PM6-R3)
  if (opts?.logger && deprecationWarnings.length > 0) {
    for (const w of deprecationWarnings) opts.logger.warn?.(w);
  }

  return out;
}

/**
 * Resolve ingestion profile for an agent (PM6-R2).
 * Precedence: agentProfiles[agentId] -> defaultProfile -> config error.
 */
export function resolveIngestionProfile(cfg: ReturnType<typeof parseConfig>, agentId: string): IngestionProfile {
  const profiles = cfg.ingestion.profiles;
  const profileNames = Object.keys(profiles);

  // If no profiles configured, nothing to resolve
  if (profileNames.length === 0) {
    throw new Error(`No ingestion profiles configured; cannot resolve profile for agent "${agentId}"`);
  }

  // Check agent-specific mapping
  const agentMapping = cfg.ingestion.agentProfiles[agentId];
  if (agentMapping && profiles[agentMapping]) {
    return profiles[agentMapping];
  }

  // Fall back to default profile
  if (cfg.ingestion.defaultProfile && profiles[cfg.ingestion.defaultProfile]) {
    return profiles[cfg.ingestion.defaultProfile];
  }

  // Explicit config error (PM6-R2 requirement 3)
  throw new Error(
    `No ingestion profile mapping for agent "${agentId}" and no defaultProfile configured`
  );
}

export function resolveBonfiresAgentId(cfg, agentId) {
  if (!agentId) return null;
  if (!Object.hasOwn(cfg.agents, agentId)) return null;
  const val = cfg.agents[agentId];
  return typeof val === 'string' ? val : null;
}
