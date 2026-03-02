import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

type LedgerEntry = { hash: string; pushedAt: string };
type Ledger = { version: number; entries: Record<string, LedgerEntry> };

type IngestItem = {
  relativePath: string;
  absPath: string;
  content: string;
  hash: string;
};

type IngestionSummary = {
  timestamp: string;
  scanned: number;
  ingested: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ file: string; error: string }>;
};

function sha256(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
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
    };
  });
}

export async function runIngestionOnce(opts: {
  rootDir: string;
  ledgerPath: string;
  summaryPath: string;
  client: { ingestContent?: (req: { sourcePath: string; content: string; contentHash: string; metadata?: Record<string, any> }) => Promise<{ accepted: number }> };
}) {
  const ledger = loadLedger(opts.ledgerPath);
  const items = collectIngestionFiles(opts.rootDir);

  const summary: IngestionSummary = {
    timestamp: new Date().toISOString(),
    scanned: items.length,
    ingested: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
  };

  for (const item of items) {
    const existing = ledger.entries[item.relativePath];
    if (existing?.hash === item.hash) {
      summary.skipped += 1;
      continue;
    }

    try {
      if (!opts.client.ingestContent) throw new Error('ingestContent is not available on client');
      await opts.client.ingestContent({
        sourcePath: item.relativePath,
        content: item.content,
        contentHash: item.hash,
        metadata: { source: 'ingestion-cron' },
      });
      ledger.entries[item.relativePath] = { hash: item.hash, pushedAt: new Date().toISOString() };
      summary.ingested += 1;
    } catch (e: any) {
      summary.errors += 1;
      summary.errorDetails.push({ file: item.relativePath, error: String(e?.message ?? e) });
    }
  }

  saveLedger(opts.ledgerPath, ledger);
  mkdirSync(dirname(opts.summaryPath), { recursive: true });
  writeFileSync(opts.summaryPath, JSON.stringify(summary, null, 2));

  return summary;
}

export function startIngestionCron(opts: {
  enabled: boolean;
  everyMinutes: number;
  rootDir: string;
  ledgerPath: string;
  summaryPath: string;
  client: { ingestContent?: (req: { sourcePath: string; content: string; contentHash: string; metadata?: Record<string, any> }) => Promise<{ accepted: number }> };
  logger?: { warn?: (msg: string) => void };
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
      });
    } catch (e: any) {
      opts.logger?.warn?.(`[ingestion] tick failed: ${e?.message ?? e}`);
    }
    if (stopped) return;
    const t = setTimeout(tick, intervalMs);
    (t as any).unref?.();
  }

  const first = setTimeout(tick, 1000);
  (first as any).unref?.();
  return () => { stopped = true; };
}
