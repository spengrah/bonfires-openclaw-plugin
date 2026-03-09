import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import register from '../src/index.js';
import { parseConfig } from '../src/config.js';
import { MockBonfiresClient } from '../src/bonfires-client.js';
import { approvalStore } from '../src/approval-store.js';
import { handleBeforeAgentStart } from '../src/hooks.js';
import { bonfiresIngestLinksTool, validateApprovalTokenContext } from '../src/tools/bonfires-ingest-links.js';
import { prepareIngestApprovalTool, validateApprovalPreparationParams } from '../src/tools/prepare-ingest-approval.js';
import { discoverLinksTool, parseDiscoveryHtml } from '../src/tools/discover-links.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_TOOL_CTX = { agentId: 'agent_primary', sessionId: 'sess-1', sessionKey: 'sk-1' };

function wrap(msg: string) {
  return `Conversation info (untrusted metadata):
\`\`\`json
{"message_id": "$test"}
\`\`\`

Sender (untrusted metadata):
\`\`\`json
{"name": "TestUser"}
\`\`\`

${msg}`;
}

function createSpyClient() {
  const calls = { ingestContent: [] as any[], ingestPdf: [] as any[] };
  return {
    calls,
    client: {
      async ingestContent(req: any) {
        calls.ingestContent.push(req);
        return { accepted: 1 };
      },
      async ingestPdf(req: any) {
        calls.ingestPdf.push(req);
        return { success: true, documentId: 'doc-123', message: 'created' };
      },
    },
  };
}

function collectRegisteredTools(pluginConfig: any = { agents: { agent_primary: 'a1' }, apiKeyEnv: 'NO_SUCH_ENV' }, toolCtx: any = TEST_TOOL_CTX) {
  const toolFactories: any[] = [];
  register({
    pluginConfig,
    resolvePath: (p: string) => p,
    logger: { warn: () => {} },
    on: () => {},
    registerTool: (factory: any) => toolFactories.push(factory),
    config: { agents: { list: [{ id: 'agent_primary', name: 'Primary Agent' }] } },
  } as any);
  return toolFactories.map((factory) => factory(toolCtx));
}

test.beforeEach(() => {
  approvalStore.reset();
});

test('PM16: parseConfig defaults discovery feature flag off', () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  assert.equal(cfg.discovery.enabled, false);
  assert.equal(cfg.discovery.maxCandidates, 10);
  assert.equal(cfg.ingestion.approval.maxUrlsPerRun, 10);
});

test('PM16: parseConfig validates discovery.maxCandidates bounds', () => {
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1' }, discovery: { maxCandidates: 0 } }));
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1' }, discovery: { maxCandidates: 26 } }));
});

test('PM16: before_agent_start injects lightweight approval guidance when links are present', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart(
    { prompt: wrap('please review https://example.com/a and https://example.com/b') },
    TEST_TOOL_CTX,
    { cfg, client },
  );
  assert.ok(res?.prependSystemContext?.includes('do not ingest them into Bonfires without explicit user approval'));
  assert.ok(res?.prependSystemContext?.includes('bonfires_prepare_ingest_approval'));
  assert.ok(res?.prependContext?.includes('Bonfires context'));
  assert.equal(client.searchCalls.length, 1, 'hook should stay lightweight and only do the existing search');
});

test('PM16: validateApprovalPreparationParams requires approvedByUser=true and non-empty approvedUrls', () => {
  assert.deepEqual(validateApprovalPreparationParams(undefined), { ok: false, error: 'approvalContext is required' });
  assert.deepEqual(validateApprovalPreparationParams({ approvedByUser: false, approvedUrls: ['https://example.com'] }), { ok: false, error: 'approvalContext.approvedByUser must be true' });
  assert.deepEqual(validateApprovalPreparationParams({ approvedByUser: true, approvedUrls: [] }), { ok: false, error: 'approvalContext.approvedUrls must be a non-empty array' });
});

test('PM16: bonfires_prepare_ingest_approval fails closed for unobserved or oversized URL sets', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' }, ingestion: { approval: { maxUrlsPerRun: 2 } } });
  const unknown = await prepareIngestApprovalTool({ approvalContext: { approvedByUser: true, approvedUrls: ['https://example.com/a'] } }, TEST_TOOL_CTX, { cfg });
  assert.equal(unknown.success, false);
  assert.equal(unknown.error, 'approvedUrls must be drawn from links already observed in this session');

  approvalStore.recordCandidateUrls(TEST_TOOL_CTX, 'user-shared-links', ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
  const oversized = await prepareIngestApprovalTool({ approvalContext: { approvedByUser: true, approvedUrls: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'] } }, TEST_TOOL_CTX, { cfg });
  assert.equal(oversized.success, false);
  assert.equal(oversized.error, 'approvedUrls exceeds maxUrlsPerRun (2)');
});

test('PM16: bonfires_ingest_links rejects missing, invalid, expired, cross-session, and raw-list bypass payloads with zero ingestion side effects', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const { client, calls } = createSpyClient();

  approvalStore.recordCandidateUrls(TEST_TOOL_CTX, 'user-shared-links', ['https://example.com/a']);
  const minted = await prepareIngestApprovalTool({ approvalContext: { approvedByUser: true, approvedUrls: ['https://example.com/a'] } }, TEST_TOOL_CTX, { cfg, nowMs: () => 1000 });
  assert.ok(minted.approvalToken);

  const cases = [
    await bonfiresIngestLinksTool({} as any, TEST_TOOL_CTX, { cfg, client: client as any }),
    await bonfiresIngestLinksTool({ approvalContext: {} as any }, TEST_TOOL_CTX, { cfg, client: client as any }),
    await bonfiresIngestLinksTool({ approvalContext: { approvalToken: 'bat_invalid' } }, TEST_TOOL_CTX, { cfg, client: client as any }),
    await bonfiresIngestLinksTool({ approvalContext: { approvedByUser: true, approvedUrls: ['https://example.com/a'] } as any }, TEST_TOOL_CTX, { cfg, client: client as any }),
    await bonfiresIngestLinksTool({ urls: ['https://evil.example/unapproved'], approvalContext: { approvalToken: minted.approvalToken! } }, TEST_TOOL_CTX, { cfg, client: client as any }),
    await bonfiresIngestLinksTool({ approvalContext: { approvalToken: minted.approvalToken! } }, { ...TEST_TOOL_CTX, sessionId: 'sess-2', sessionKey: 'sk-2' }, { cfg, client: client as any }),
    await bonfiresIngestLinksTool({ approvalContext: { approvalToken: minted.approvalToken! } }, TEST_TOOL_CTX, { cfg, client: client as any, nowMs: () => 1000 + 10 * 60_000 + 1 }),
  ];

  for (const result of cases) assert.equal(result.success, false);
  assert.deepEqual(calls, { ingestContent: [], ingestPdf: [] });
});

test('PM16: bonfires_prepare_ingest_approval and bonfires_ingest_links resolve exact observed user-approved set end-to-end', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, _opts: any) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/plain' }),
    body: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: new Uint8Array(Buffer.from('hello world')) };
          },
          cancel: async () => {},
        };
      },
    },
  })) as any;

  try {
    approvalStore.recordCandidateUrls(TEST_TOOL_CTX, 'user-shared-links', ['https://example.com/a', 'https://example.com/a ', 'https://example.com/b']);
    const prepared = await prepareIngestApprovalTool({
      approvalContext: {
        approvedByUser: true,
        approvedUrls: ['https://example.com/a', 'https://example.com/a ', 'https://example.com/b'],
      },
    }, TEST_TOOL_CTX, { cfg });
    assert.ok(prepared.approvalToken);

    const result = await bonfiresIngestLinksTool({
      approvalContext: { approvalToken: prepared.approvalToken! },
    }, TEST_TOOL_CTX, { cfg, client });
    assert.equal(result.summary?.requested, 2, 'duplicate approved URLs should normalize/dedupe');
    assert.equal(result.summary?.ingested, 2);
    assert.equal(result.summary?.duplicates, 0);
    assert.equal(result.results?.length, 2);
    assert.deepEqual(result.results?.map((r) => r.url), ['https://example.com/a', 'https://example.com/b']);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('PM16: bonfires_ingest_links preserves per-link partial failure summary after token resolution', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/plain' }),
    body: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: new Uint8Array(Buffer.from('ok')) };
          },
          cancel: async () => {},
        };
      },
    },
  })) as any;
  try {
    approvalStore.recordCandidateUrls(TEST_TOOL_CTX, 'user-shared-links', ['https://example.com/good', 'http://127.0.0.1/private']);
    const prepared = await prepareIngestApprovalTool({
      approvalContext: {
        approvedByUser: true,
        approvedUrls: ['https://example.com/good', 'http://127.0.0.1/private'],
      },
    }, TEST_TOOL_CTX, { cfg });
    const result = await bonfiresIngestLinksTool({ approvalContext: { approvalToken: prepared.approvalToken! } }, TEST_TOOL_CTX, { cfg, client });
    assert.equal(result.summary?.requested, 2);
    assert.equal(result.summary?.ingested, 1);
    assert.equal(result.summary?.blocked, 1);
    assert.equal(result.summary?.failed, 0);
    assert.equal(result.results?.every((r) => typeof r.success === 'boolean'), true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('PM17: discover_links is disabled by default feature flag', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const result = await discoverLinksTool({ query: 'test query' }, TEST_TOOL_CTX, { cfg });
  assert.equal(result.success, false);
  assert.ok(result.error?.includes('disabled by feature flag'));
});

test('PM17: parseDiscoveryHtml extracts bounded candidate set with metadata', () => {
  const html = `
    <a class="result__a" href="https://example.com/a">Example A</a>
    <div class="result__snippet">First snippet with <b>markup</b>.</div>
    <a class="result__a" href="https://example.com/b.pdf">Example B</a>
    <div class="result__snippet">Second snippet.</div>
  `;
  const results = parseDiscoveryHtml(html, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Example A');
  assert.equal(results[0].url, 'https://example.com/a');
  assert.ok(results[0].snippet?.startsWith('First snippet with markup'));
});

test('PM17: discover_links returns candidate metadata when feature flag enabled', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' }, discovery: { enabled: true, maxCandidates: 5 } });
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    text: async () => `
      <a class="result__a" href="https://example.com/a">Example A</a>
      <div class="result__snippet">First snippet.</div>
      <a class="result__a" href="https://example.com/b.pdf">Example B</a>
      <div class="result__snippet">Second snippet.</div>
    `,
  })) as any;
  try {
    const result = await discoverLinksTool({ query: 'approval gated ingestion', maxCandidates: 2 }, TEST_TOOL_CTX, { cfg });
    assert.equal(result.count, 2);
    assert.equal(result.results?.[0].url, 'https://example.com/a');
    assert.equal(result.results?.[1].contentTypeGuess, 'application/pdf');
    assert.equal(typeof result.results?.[0].confidence, 'number');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('PM17: discovery-selected approval subset is the exact and only executable ingest set end-to-end', async () => {
  const tools = collectRegisteredTools({
    agents: { agent_primary: 'a1' },
    apiKeyEnv: 'NO_SUCH_ENV',
    discovery: { enabled: true, maxCandidates: 5 },
  });
  const discoverTool = tools.find((tool) => tool.name === 'discover_links');
  const prepareTool = tools.find((tool) => tool.name === 'bonfires_prepare_ingest_approval');
  const ingestLinksTool = tools.find((tool) => tool.name === 'bonfires_ingest_links');
  assert.ok(discoverTool);
  assert.ok(prepareTool);
  assert.ok(ingestLinksTool);

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('duckduckgo.com')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <a class="result__a" href="https://example.com/a">Example A</a>
          <div class="result__snippet">Alpha</div>
          <a class="result__a" href="https://example.com/b">Example B</a>
          <div class="result__snippet">Beta</div>
          <a class="result__a" href="https://example.com/c">Example C</a>
          <div class="result__snippet">Gamma</div>
        `,
      } as any;
    }

    assert.equal(init?.method, 'GET');
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: new Uint8Array(Buffer.from(`content for ${String(url)}`)) };
            },
            cancel: async () => {},
          };
        },
      },
    } as any;
  }) as any;

  try {
    const discovered = await discoverTool.execute('call-1', { query: 'example corpus', maxCandidates: 3 });
    const candidates = discovered.details.results;
    assert.deepEqual(candidates.map((r: any) => r.url), [
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);

    const approvedSubset = [candidates[1].url, candidates[2].url];
    const prepared = await prepareTool.execute('call-2', {
      approvalContext: {
        approvedByUser: true,
        approvedUrls: approvedSubset,
      },
    });

    const ingested = await ingestLinksTool.execute('call-3', {
      approvalContext: {
        approvalToken: prepared.details.approvalToken,
      },
    });

    assert.equal(ingested.details.summary.requested, 2);
    assert.deepEqual(ingested.details.results.map((r: any) => r.url), approvedSubset);
    assert.equal(ingested.details.results.some((r: any) => r.url === candidates[0].url), false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('PM16/PM17: plugin registers the explicit PM16/PM17 tool surface and schemas', () => {
  const tools = collectRegisteredTools();
  const toolNames = tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, [
    'bonfires_ingest_link',
    'bonfires_ingest_links',
    'bonfires_prepare_ingest_approval',
    'bonfires_search',
    'bonfires_stack_search',
    'discover_links',
  ]);

  const prepareTool = tools.find((tool) => tool.name === 'bonfires_prepare_ingest_approval');
  const ingestLinksTool = tools.find((tool) => tool.name === 'bonfires_ingest_links');
  const discoverTool = tools.find((tool) => tool.name === 'discover_links');
  assert.ok(prepareTool.description.includes('session-bound approval token'));
  assert.equal(prepareTool.parameters.required[0], 'approvalContext');
  assert.equal(prepareTool.parameters.properties.approvalContext.additionalProperties, false);
  assert.equal(prepareTool.parameters.properties.approvalContext.properties.approvedUrls.minItems, 1);
  assert.equal(prepareTool.parameters.properties.approvalContext.properties.approvedUrls.maxItems, 10);

  assert.ok(ingestLinksTool.description.includes('approvalContext.approvalToken'));
  assert.equal(ingestLinksTool.parameters.required[0], 'approvalContext');
  assert.equal(ingestLinksTool.parameters.properties.approvalContext.additionalProperties, false);
  assert.equal(ingestLinksTool.parameters.properties.approvalContext.properties.approvalToken.minLength, 1);
  assert.equal(ingestLinksTool.parameters.additionalProperties, false);

  assert.ok(discoverTool.description.includes('mint an approval token'));
  assert.deepEqual(discoverTool.parameters.required, ['query']);
  assert.equal(discoverTool.parameters.properties.maxCandidates.minimum, 1);
  assert.equal(discoverTool.parameters.properties.maxCandidates.maximum, 25);
  assert.equal(discoverTool.parameters.additionalProperties, false);

  const indexSrc = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  assert.ok(indexSrc.includes("name:'bonfires_prepare_ingest_approval'"));
  assert.ok(indexSrc.includes("name:'bonfires_ingest_links'"));
  assert.ok(indexSrc.includes("name:'discover_links'"));
});
