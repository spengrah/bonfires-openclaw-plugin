import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import type { IngestionProfile } from './config.js';
import { classifyRouteByPath, isDuplicateResponse, type IngestionRoute } from './ingestion-core.js';

type LedgerEntry = { hash: string; pushedAt: string };
type Ledger = { version: number; entries: Record<string, LedgerEntry> };

type IngestItem = {
  relativePath: string;
  absPath: string;
  content: string;
  binaryContent?: Buffer;
  hash: string;
  route: IngestionRoute;
};

export type IngestionSummary = {
  timestamp: string;
  scanned: number;
  ingested: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ file: string; error: string }>;
  profiles?: Record<string, { scanned: number; ingested: number; skipped: number; errors: number }>;
  agents?: Record<string, { profile: string }>;
};

function sha256(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function sha256Binary(content: Buffer) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
}

function isMarkdown(path: string) {
  return path.endsWith('.md');
}

function loadLedger(path: string): Ledger {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { version: 1, entries: {} };
  }
}

function saveLedger(path: string, ledger: Ledger) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2));
}

/**
 * Legacy file collection: scans memory/, vault/, projects/ hardcoded dirs.
 * Preserved for backward compatibility when no profiles are configured.
 */
function collectIngestionFiles(rootDir: string): IngestItem[] {
  const absRoot = resolve(rootDir);
  const candidates: string[] = [];

  const memoryDir = join(absRoot, 'memory');
  const vaultDir = join(absRoot, 'vault');
  const projectsDir = join(absRoot, 'projects');

  for (const dir of [memoryDir, vaultDir]) {
    try { if (statSync(dir).isDirectory()) walk(dir, candidates); } catch {}
  }

  try {
    for (const project of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!project.isDirectory()) continue;
      const pdir = join(projectsDir, project.name);
      const readme = join(pdir, 'README.md');
      try { if (statSync(readme).isFile()) candidates.push(readme); } catch {}
      const aiSpec = join(pdir, '.ai', 'spec');
      try { if (statSync(aiSpec).isDirectory()) walk(aiSpec, candidates); } catch {}
    }
  } catch {}

  const dedup = [...new Set(candidates)]
    .filter((p) => isMarkdown(p))
    .filter((p) => !p.includes('/node_modules/'));

  return dedup.map((absPath) => {
    const content = readFileSync(absPath, 'utf8');
    return {
      absPath,
      relativePath: relative(absRoot, absPath),
      content,
      hash: sha256(content),
      route: 'text' as IngestionRoute,
    };
  });
}

/**
 * Match a relative path against a simple glob pattern.
 * Supports **, *, and ? wildcards. Evaluated relative to profile rootDir.
 */
function globMatch(pattern: string, filePath: string): boolean {
  // Convert glob to regex
  let regex = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      // ** matches any number of path segments
      regex += '.*';
      i += 2;
      if (pattern[i] === '/') i++; // skip trailing slash after **
    } else if (c === '*') {
      regex += '[^/]*';
      i++;
    } else if (c === '?') {
      regex += '[^/]';
      i++;
    } else if (c === '.') {
      regex += '\\.';
      i++;
    } else {
      regex += c;
      i++;
    }
  }
  return new RegExp(`^${regex}$`).test(filePath);
}

/**
 * Profile-based file collection (PM6-R1).
 * Scans rootDir, applies includeGlobs/excludeGlobs/extensions filters.
 */
function collectProfileFiles(profile: IngestionProfile, profileName: string): IngestItem[] {
  const absRoot = resolve(profile.rootDir);
  const allFiles: string[] = [];

  try {
    if (statSync(absRoot).isDirectory()) walk(absRoot, allFiles);
  } catch {
    return []; // rootDir doesn't exist or isn't accessible
  }

  const result: IngestItem[] = [];
  const seen = new Set<string>();

  for (const absPath of allFiles) {
    const rel = relative(absRoot, absPath);
    if (seen.has(rel)) continue;
    seen.add(rel);

    // Extension filter (PM6-R4)
    const ext = extname(absPath);
    if (profile.extensions.length > 0 && !profile.extensions.includes(ext)) continue;

    // Exclude glob filter
    if (profile.excludeGlobs.some((g) => globMatch(g, rel))) continue;

    // Include glob filter
    if (!profile.includeGlobs.some((g) => globMatch(g, rel))) continue;

    try {
      const route = classifyRouteByPath(absPath);
      if (route === 'pdf') {
        const bin = readFileSync(absPath);
        result.push({
          absPath,
          relativePath: `${profileName}:${rel}`,
          content: '',
          binaryContent: bin,
          hash: sha256Binary(bin),
          route,
        });
      } else {
        const content = readFileSync(absPath, 'utf8');
        result.push({
          absPath,
          relativePath: `${profileName}:${rel}`,
          content,
          hash: sha256(content),
          route,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return result;
}

export async function runIngestionOnce(opts: {
  rootDir: string;
  ledgerPath: string;
  summaryPath: string;
  client: {
    ingestContent?: (req: { sourcePath: string; content: string; contentHash: string; metadata?: Record<string, any> }) => Promise<{ accepted: number }>;
    ingestPdf?: (req: { sourcePath: string; content: Buffer; contentHash: string; metadata?: Record<string, any> }) => Promise<{ success: boolean; documentId?: string; message?: string }>;
  };
  profiles?: Record<string, IngestionProfile>;
  agentProfiles?: Record<string, string>;
  defaultProfile?: string;
  activeAgentId?: string;
}) {
  const ledger = loadLedger(opts.ledgerPath);

  const profileNames = opts.profiles ? Object.keys(opts.profiles) : [];
  const hasProfiles = profileNames.length > 0;
  const hasProfileSelectors = Boolean(opts.defaultProfile) || Boolean(opts.agentProfiles && Object.keys(opts.agentProfiles).length > 0);
  const requiresProfileResolution = Boolean(opts.defaultProfile) || Boolean(opts.activeAgentId);

  if (!hasProfiles && hasProfileSelectors) {
    throw new Error('Ingestion profile mapping/default is configured but no ingestion profiles are defined');
  }

  // Collect items: profile-based or legacy
  let items: IngestItem[];
  const profileStats: Record<string, { scanned: number; ingested: number; skipped: number; errors: number }> = {};

  if (hasProfiles) {
    items = [];

    // PM6-R2 runtime behavior: when explicit profile resolution inputs are present,
    // resolve a single active profile and fail explicitly when unresolved.
    if (requiresProfileResolution) {
      let selectedProfileName: string | undefined;
      if (opts.activeAgentId && opts.agentProfiles?.[opts.activeAgentId]) {
        selectedProfileName = opts.agentProfiles[opts.activeAgentId];
      } else if (opts.defaultProfile) {
        selectedProfileName = opts.defaultProfile;
      }

      const selectedProfile = selectedProfileName ? opts.profiles![selectedProfileName] : undefined;
      if (!selectedProfile) {
        throw new Error(`Configured ingestion profile "${selectedProfileName}" was not found`);
      }

      const selectedItems = collectProfileFiles(selectedProfile, selectedProfileName);
      profileStats[selectedProfileName] = { scanned: selectedItems.length, ingested: 0, skipped: 0, errors: 0 };
      items.push(...selectedItems);
    } else {
      for (const [name, profile] of Object.entries(opts.profiles!)) {
        const profileItems = collectProfileFiles(profile, name);
        profileStats[name] = { scanned: profileItems.length, ingested: 0, skipped: 0, errors: 0 };
        items.push(...profileItems);
      }
    }
  } else {
    items = collectIngestionFiles(opts.rootDir);
  }

  const summary: IngestionSummary = {
    timestamp: new Date().toISOString(),
    scanned: items.length,
    ingested: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
  };

  // Add profile and agent dimensions when profiles are active (PM6-R5)
  if (hasProfiles) {
    summary.profiles = profileStats;
    if (opts.agentProfiles && Object.keys(opts.agentProfiles).length > 0) {
      summary.agents = {};
      for (const [agentId, profileName] of Object.entries(opts.agentProfiles)) {
        summary.agents[agentId] = { profile: profileName };
      }
    }
  }

  for (const item of items) {
    const existing = ledger.entries[item.relativePath];
    if (existing?.hash === item.hash) {
      summary.skipped += 1;
      if (hasProfiles) {
        const pName = item.relativePath.split(':')[0];
        if (profileStats[pName]) profileStats[pName].skipped += 1;
      }
      continue;
    }

    try {
      if (item.route === 'pdf') {
        if (!opts.client.ingestPdf) throw new Error('ingestPdf is not available on client');
        const result = await opts.client.ingestPdf({
          sourcePath: item.relativePath,
          content: item.binaryContent!,
          contentHash: item.hash,
          metadata: { source: 'ingestion-cron' },
        });
        // PM14-R5: duplicate response is treated as successful no-op
        if (isDuplicateResponse(result)) {
          summary.skipped += 1;
          if (hasProfiles) {
            const pName = item.relativePath.split(':')[0];
            if (profileStats[pName]) profileStats[pName].skipped += 1;
          }
        } else {
          ledger.entries[item.relativePath] = { hash: item.hash, pushedAt: new Date().toISOString() };
          summary.ingested += 1;
          if (hasProfiles) {
            const pName = item.relativePath.split(':')[0];
            if (profileStats[pName]) profileStats[pName].ingested += 1;
          }
        }
      } else {
        if (!opts.client.ingestContent) throw new Error('ingestContent is not available on client');
        await opts.client.ingestContent({
          sourcePath: item.relativePath,
          content: item.content,
          contentHash: item.hash,
          metadata: { source: 'ingestion-cron' },
        });
        ledger.entries[item.relativePath] = { hash: item.hash, pushedAt: new Date().toISOString() };
        summary.ingested += 1;
        if (hasProfiles) {
          const pName = item.relativePath.split(':')[0];
          if (profileStats[pName]) profileStats[pName].ingested += 1;
        }
      }
    } catch (e: any) {
      summary.errors += 1;
      summary.errorDetails.push({ file: item.relativePath, error: String(e?.message ?? e) });
      if (hasProfiles) {
        const pName = item.relativePath.split(':')[0];
        if (profileStats[pName]) profileStats[pName].errors += 1;
      }
    }
  }

  saveLedger(opts.ledgerPath, ledger);
  mkdirSync(dirname(opts.summaryPath), { recursive: true });
  writeFileSync(opts.summaryPath, JSON.stringify(summary, null, 2));

  return summary;
}

function isDeterministicConfigError(message: string) {
  return message.includes('no ingestion profiles are defined')
    || message.includes('Configured ingestion profile');
}

export function startIngestionCron(opts: {
  enabled: boolean;
  everyMinutes: number;
  rootDir: string;
  ledgerPath: string;
  summaryPath: string;
  client: {
    ingestContent?: (req: { sourcePath: string; content: string; contentHash: string; metadata?: Record<string, any> }) => Promise<{ accepted: number }>;
    ingestPdf?: (req: { sourcePath: string; content: Buffer; contentHash: string; metadata?: Record<string, any> }) => Promise<{ success: boolean; documentId?: string; message?: string }>;
  };
  logger?: { warn?: (msg: string) => void };
  profiles?: Record<string, IngestionProfile>;
  agentProfiles?: Record<string, string>;
  defaultProfile?: string;
  activeAgentId?: string;
}) {
  if (!opts.enabled) return () => {};

  let stopped = false;
  const intervalMs = Math.max(1, opts.everyMinutes) * 60_000;

  async function tick() {
    if (stopped) return;
    try {
      await runIngestionOnce({
        rootDir: opts.rootDir,
        ledgerPath: opts.ledgerPath,
        summaryPath: opts.summaryPath,
        client: opts.client,
        profiles: opts.profiles,
        agentProfiles: opts.agentProfiles,
        defaultProfile: opts.defaultProfile,
        activeAgentId: opts.activeAgentId,
      });
    } catch (e: any) {
      const message = String(e?.message ?? e);
      opts.logger?.warn?.(`[ingestion] tick failed: ${message}`);
      if (isDeterministicConfigError(message)) {
        stopped = true;
        opts.logger?.warn?.('[ingestion] scheduler disabled after non-retriable configuration error');
        return;
      }
    }
    if (stopped) return;
    const t = setTimeout(tick, intervalMs);
    (t as any).unref?.();
  }

  const first = setTimeout(tick, 1000);
  (first as any).unref?.();
  return () => { stopped = true; };
}
