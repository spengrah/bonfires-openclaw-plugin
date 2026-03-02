import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HostedBonfiresClient } from '../src/bonfires-client.js';

export type ProbeResult = {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details?: string;
  elapsedMs?: number;
};

export function redactEnvSummary(envName: string, value?: string) {
  return { env: envName, present: Boolean(value), length: value ? value.length : 0 };
}

async function timed(name: string, fn: () => Promise<void>): Promise<ProbeResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: 'PASS', elapsedMs: Date.now() - start };
  } catch (e: any) {
    return { name, status: 'FAIL', elapsedMs: Date.now() - start, details: String(e?.message ?? e) };
  }
}

async function runFixtureContractProbes(baseCfg: any): Promise<ProbeResult[]> {
  const probes: ProbeResult[] = [];
  const oldFetch = globalThis.fetch;
  const oldKey = process.env[baseCfg.apiKeyEnv];
  process.env[baseCfg.apiKeyEnv] = 'fixture-key';

  try {
    probes.push(await timed('contract:/delve normalization', async () => {
      globalThis.fetch = (async (_url: any) => new Response(JSON.stringify({
        episodes: [{ summary: 'Episode A' }],
        entities: [{ name: 'Entity A' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
      const c = new HostedBonfiresClient(baseCfg);
      const out = await c.search({ agentId: 'agent-1', query: 'q', limit: 3 });
      if (!Array.isArray(out.results) || out.results.length < 2) throw new Error('normalized results missing');
    }));

    probes.push(await timed('contract:/stack/add mapping', async () => {
      const bodies: any[] = [];
      globalThis.fetch = (async (_url: any, init: any) => {
        bodies.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as any;
      const c = new HostedBonfiresClient(baseCfg);
      const out = await c.capture({
        agentId: 'agent-1',
        sessionKey: 's-1',
        messages: [{ role: 'user', content: 'hi' }],
      });
      if (out.accepted !== 1) throw new Error('capture accepted mismatch');
      const payload = bodies[0] ?? {};
      if (!payload?.message?.text || payload?.message?.chatId !== 's-1') throw new Error('stack/add payload mapping mismatch');
    }));

    probes.push(await timed('contract:/stack/process response handling', async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, message_count: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
      const c = new HostedBonfiresClient(baseCfg);
      const out = await c.processStack!({ agentId: 'agent-1' });
      if (!out.success || out.message_count !== 2) throw new Error('stack/process response mapping mismatch');
    }));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env[baseCfg.apiKeyEnv]; else process.env[baseCfg.apiKeyEnv] = oldKey;
  }

  return probes;
}

async function runLivePreflight(baseCfg: any): Promise<ProbeResult[]> {
  const probes: ProbeResult[] = [];
  const apiKey = process.env[baseCfg.apiKeyEnv];
  const bonfireId = baseCfg.bonfireId;

  if (!apiKey || !bonfireId) {
    return [
      { name: 'preflight:/healthz', status: 'SKIP', details: 'missing api key or bonfire id' },
      { name: 'preflight:/generate_summaries auth+bonfire', status: 'SKIP', details: 'missing api key or bonfire id' },
    ];
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const base = String(baseCfg.baseUrl).replace(/\/$/, '');

  probes.push(await timed('preflight:/healthz', async () => {
    const res = await fetch(`${base}/healthz`, { method: 'GET', headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }));

  probes.push(await timed('preflight:/generate_summaries auth+bonfire', async () => {
    const res = await fetch(`${base}/generate_summaries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        bonfire_id: bonfireId,
        messages: [{ role: 'user', content: 'preflight probe' }],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }));

  return probes;
}

function buildReport(mode: 'fixture' | 'live', cfg: any, probes: ProbeResult[]) {
  const failed = probes.filter((p) => p.status === 'FAIL');
  return {
    timestamp: new Date().toISOString(),
    mode,
    verdict: failed.length ? 'FAIL' : 'PASS',
    config: {
      baseUrl: cfg.baseUrl,
      apiKey: redactEnvSummary(cfg.apiKeyEnv, process.env[cfg.apiKeyEnv]),
      bonfireIdPresent: Boolean(cfg.bonfireId),
    },
    probes,
  };
}

export async function runHostedVerification(argv: string[] = process.argv.slice(2)) {
  const mode: 'fixture' | 'live' = argv.includes('--live') ? 'live' : 'fixture';
  const cfg = {
    baseUrl: process.env.BONFIRES_BASE_URL ?? 'https://tnt-v2.api.bonfires.ai/',
    apiKeyEnv: process.env.BONFIRES_API_KEY_ENV ?? 'DELVE_API_KEY',
    bonfireId: process.env.BONFIRE_ID ?? '',
    network: { timeoutMs: 12000, retryBackoffMs: [0, 0] },
  };

  const probes = [
    ...(await runFixtureContractProbes(cfg)),
    ...(mode === 'live' ? await runLivePreflight(cfg) : [
      { name: 'preflight:/healthz', status: 'SKIP', details: 'live mode not requested' },
      { name: 'preflight:/generate_summaries auth+bonfire', status: 'SKIP', details: 'live mode not requested' },
    ] as ProbeResult[]),
  ];

  const report = buildReport(mode, cfg, probes);
  const outPath = '.ai/log/plan/hosted-integration-verification-current.json';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  for (const p of probes) {
    console.log(`[verify:hosted] ${p.status} ${p.name}${p.details ? ` — ${p.details}` : ''}`);
  }
  console.log(`[verify:hosted] report: ${outPath}`);

  if (report.verdict === 'FAIL') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHostedVerification();
}
