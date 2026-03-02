import { createBonfiresClient } from '../src/bonfires-client.js';
import { parseConfig } from '../src/config.js';
import { runIngestionOnce } from '../src/ingestion.js';

function loadAgentsFromEnv(): Record<string, string> {
  const raw = process.env.BONFIRES_AGENTS;
  if (raw) return JSON.parse(raw);
  const id = process.env.BONFIRES_AGENT_ID;
  if (id) return { ingest: id };
  throw new Error('Set BONFIRES_AGENTS (JSON map) or BONFIRES_AGENT_ID env var');
}

export async function runIngestionCli() {
  const cfg = parseConfig({
    baseUrl: process.env.BONFIRES_BASE_URL,
    apiKeyEnv: process.env.BONFIRES_API_KEY_ENV,
    bonfireId: process.env.BONFIRE_ID,
    agents: loadAgentsFromEnv(),
    ingestion: {
      enabled: true,
      everyMinutes: Number(process.env.BONFIRES_INGEST_EVERY_MINUTES ?? 1440),
      rootDir: process.env.BONFIRES_INGEST_ROOT_DIR ?? process.cwd(),
      ledgerPath: process.env.BONFIRES_INGEST_LEDGER_PATH ?? '.ai/log/plan/ingestion-hash-ledger.json',
      summaryPath: process.env.BONFIRES_INGEST_SUMMARY_PATH ?? '.ai/log/plan/ingestion-cron-summary-current.json',
    },
  });

  const client = createBonfiresClient({
    ...cfg,
    strictHostedMode: false,
  });

  const summary = await runIngestionOnce({
    rootDir: cfg.ingestion.rootDir,
    ledgerPath: cfg.ingestion.ledgerPath,
    summaryPath: cfg.ingestion.summaryPath,
    client,
  });

  console.log(`[ingest] scanned=${summary.scanned} ingested=${summary.ingested} skipped=${summary.skipped} errors=${summary.errors}`);
  if (summary.errors > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestionCli();
}
