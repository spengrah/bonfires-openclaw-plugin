import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.js';
import { MockBonfiresClient, HostedBonfiresClient } from '../src/bonfires-client.js';
import { InMemoryCaptureLedger } from '../src/capture-ledger.js';
import { handleBeforeAgentStart, handleAgentEnd, handleSessionEnd } from '../src/hooks.js';
import { bonfiresStackSearchTool } from '../src/tools/bonfires-stack-search.js';

const cfg = parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' } });

/** Wrap a message with metadata so handleBeforeAgentStart treats it as a real user message. */
function wrap(msg: string) {
  return `Conversation info (untrusted metadata):\n\`\`\`json\n{"message_id": "$test"}\n\`\`\`\n\nSender (untrusted metadata):\n\`\`\`json\n{"name": "TestUser"}\n\`\`\`\n\n${msg}`;
}

// --- Branch coverage: metadata-only prompt with no actual message ---

test('before_agent_start skips when prompt is metadata-only with no user message', async () => {
  const client = new MockBonfiresClient();
  const metadataOnly = 'Conversation info (untrusted metadata):\n```json\n{"message_id": "$abc"}\n```\n\nSender (untrusted metadata):\n```json\n{"name": "Spencer"}\n```\n   ';
  const res = await handleBeforeAgentStart(
    { prompt: metadataOnly },
    { agentId: 'agent_primary' },
    { cfg, client },
  );
  assert.equal(client.searchCalls.length, 0);
  assert.equal(res, undefined);
});

// --- PM12: First-message-only injection ---

test('before_agent_start injects on first message of session (PM12)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello world') },
    { agentId: 'agent_primary', sessionId: 'sess-uuid-1' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 1);
  assert.ok(res?.prependContext?.includes('Bonfires context'));
  assert.equal(ledger.hasInjected('sess-uuid-1'), true);
});

test('before_agent_start skips injection on subsequent messages (PM12)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();

  // First message — injects
  await handleBeforeAgentStart(
    { prompt: wrap('first message') },
    { agentId: 'agent_primary', sessionId: 'sess-uuid-2' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 1);

  // Second message — skips
  const res = await handleBeforeAgentStart(
    { prompt: wrap('second message') },
    { agentId: 'agent_primary', sessionId: 'sess-uuid-2' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 1); // No additional search
  assert.equal(res, undefined);
});

test('before_agent_start re-injects for new sessionId (PM12)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();

  // First session
  await handleBeforeAgentStart(
    { prompt: wrap('message 1') },
    { agentId: 'agent_primary', sessionId: 'session-a' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 1);

  // Second message in same session — skips
  await handleBeforeAgentStart(
    { prompt: wrap('message 2') },
    { agentId: 'agent_primary', sessionId: 'session-a' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 1);

  // New session — re-injects
  const res = await handleBeforeAgentStart(
    { prompt: wrap('message 3') },
    { agentId: 'agent_primary', sessionId: 'session-b' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 2);
  assert.ok(res?.prependContext?.includes('Bonfires context'));
});

test('before_agent_start marks injected even when search returns empty (PM12)', async () => {
  const client = new MockBonfiresClient();
  client.search = async (req) => { client.searchCalls.push(req); return { results: [] }; };
  const ledger = new InMemoryCaptureLedger();

  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary', sessionId: 'sess-empty' },
    { cfg, client, ledger },
  );
  assert.equal(res, undefined);
  assert.equal(ledger.hasInjected('sess-empty'), true);
});

test('before_agent_start does not mark injected on search error (PM12)', async () => {
  const client = new MockBonfiresClient();
  client.shouldThrowSearch = true;
  const ledger = new InMemoryCaptureLedger();

  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary', sessionId: 'sess-err' },
    { cfg, client, ledger },
  );
  assert.equal(res, undefined);
  assert.equal(ledger.hasInjected('sess-err'), false);
});

test('before_agent_start works without sessionId (backward compat)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();

  // No sessionId — always injects (backward compatible)
  const res1 = await handleBeforeAgentStart(
    { prompt: wrap('msg 1') },
    { agentId: 'agent_primary' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 1);
  assert.ok(res1?.prependContext);

  const res2 = await handleBeforeAgentStart(
    { prompt: wrap('msg 2') },
    { agentId: 'agent_primary' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 2);
  assert.ok(res2?.prependContext);
});

test('before_agent_start works without ledger (backward compat)', async () => {
  const client = new MockBonfiresClient();

  // No ledger passed — always injects
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary', sessionId: 'sess-no-ledger' },
    { cfg, client },
  );
  assert.equal(client.searchCalls.length, 1);
  assert.ok(res?.prependContext);
});

test('before_agent_start skips system message then injects on first real user message (PM12)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();

  // Session startup (system-generated, no metadata wrapper) — skipped, not marked
  const res1 = await handleBeforeAgentStart(
    { prompt: 'A new session was started via /new or /reset. Execute your Session Startup sequence now.' },
    { agentId: 'agent_primary', sessionId: 'sess-startup' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 0);
  assert.equal(res1, undefined);
  assert.equal(ledger.hasInjected('sess-startup'), false);

  // First real user message (has metadata wrapper) — injects
  const res2 = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary', sessionId: 'sess-startup' },
    { cfg, client, ledger },
  );
  assert.equal(client.searchCalls.length, 1);
  assert.ok(res2?.prependContext?.includes('Bonfires context'));
  assert.equal(ledger.hasInjected('sess-startup'), true);
});

// --- PM12: chatId uses sessionId ---

test('agent_end passes sessionId to capture (PM12)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd(
    { messages: [{ role: 'user', content: 'hello' }] },
    { agentId: 'agent_primary', sessionKey: 'chan-key', sessionId: 'sess-uuid' },
    { cfg, client, ledger, nowMs: () => 1000 },
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].sessionId, 'sess-uuid');
  assert.equal(client.captureCalls[0].sessionKey, 'chan-key');
});

test('session_end passes sessionId to capture (PM12)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'hello' }] },
    { agentId: 'agent_primary', sessionKey: 'chan-key', sessionId: 'sess-uuid' },
    { cfg, client, ledger, logger: { warn: () => {} }, nowMs: () => 1000 },
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].sessionId, 'sess-uuid');
});

// --- PM12: stack/add includes role and username ---

test('hosted capture includes role and username in stack messages (PM12)', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    await c.capture({
      agentId: 'a1',
      sessionKey: 's1',
      messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi there' }],
    });
    assert.equal(bodies.length, 1);
    const [userMsg, assistantMsg] = bodies[0].messages;
    assert.equal(userMsg.role, 'user');
    assert.equal(userMsg.username, 'user');
    assert.equal(assistantMsg.role, 'assistant');
    assert.equal(assistantMsg.username, 'a1');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted capture uses sessionId as chatId when provided (PM12)', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let body: any = null;
  globalThis.fetch = (async (_url: any, init: any) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    await c.capture({
      agentId: 'a1',
      sessionKey: 'agent:main:channel:abc',
      sessionId: 'a8450ecd-04f7-4945-a190-dd87726aba2b',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(body.message.chatId, 'a8450ecd-04f7-4945-a190-dd87726aba2b');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted capture falls back to sessionKey as chatId when sessionId absent (PM12)', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let body: any = null;
  globalThis.fetch = (async (_url: any, init: any) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    await c.capture({
      agentId: 'a1',
      sessionKey: 'agent:main:channel:abc',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(body.message.chatId, 'agent:main:channel:abc');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

// --- PM12: agent_id passed to /delve ---

test('hosted search passes agent_id to /delve (PM12)', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let reqBody: any = null;
  globalThis.fetch = (async (_url: any, init: any) => {
    reqBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ episodes: [], entities: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    await c.search({ agentId: 'a1', query: 'test', limit: 5 });
    assert.equal(reqBody.agent_id, 'a1');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

// --- PM12: bonfires_stack_search tool ---

test('bonfires_stack_search validates query and returns results', async () => {
  const client = new MockBonfiresClient();
  const out = await bonfiresStackSearchTool({ query: 'test', limit: 5 }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.stackSearchCalls.length, 1);
  assert.equal(client.stackSearchCalls[0].query, 'test');
  assert.equal(client.stackSearchCalls[0].limit, 5);
  assert.deepEqual(out.results, []);
  assert.equal(out.count, 0);
});

test('bonfires_stack_search rejects missing query', async () => {
  const client = new MockBonfiresClient();
  await assert.rejects(async () => bonfiresStackSearchTool({}, { agentId: 'agent_primary' }, { cfg, client }));
});

test('bonfires_stack_search clamps limit to 1-100', async () => {
  const client = new MockBonfiresClient();
  await bonfiresStackSearchTool({ query: 'test', limit: 200 }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.stackSearchCalls[0].limit, 100);
  await bonfiresStackSearchTool({ query: 'test', limit: 0 }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.stackSearchCalls[1].limit, 1);
});

test('bonfires_stack_search returns empty for unknown agent', async () => {
  const client = new MockBonfiresClient();
  const out = await bonfiresStackSearchTool({ query: 'test' }, { agentId: 'unknown' }, { cfg, client, logger: { warn: () => {} } });
  assert.deepEqual(out.results, []);
  assert.equal(out.count, 0);
});

test('bonfires_stack_search uses default limit of 10', async () => {
  const client = new MockBonfiresClient();
  await bonfiresStackSearchTool({ query: 'test' }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.stackSearchCalls[0].limit, 10);
});

test('hosted stackSearch hits correct endpoint', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let hit = '';
  let reqBody: any = null;
  globalThis.fetch = (async (url: any, init: any) => {
    hit = String(url);
    reqBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ success: true, results: [{ text: 'msg1' }], count: 1, query: 'test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.stackSearch!({ agentId: 'a1', query: 'test', limit: 5 });
    assert.ok(hit.includes('/agents/a1/stack/search'));
    assert.equal(reqBody.query, 'test');
    assert.equal(reqBody.limit, 5);
    assert.equal(out.results.length, 1);
    assert.equal(out.count, 1);
    assert.equal(out.query, 'test');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted stackSearch handles empty response', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.stackSearch!({ agentId: 'a1', query: 'test' });
    assert.deepEqual(out.results, []);
    assert.equal(out.count, 0);
    assert.equal(out.query, 'test');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

// --- PM12: Injection tracker on capture ledger ---

test('capture ledger injection tracking is in-memory only (PM12)', () => {
  const ledger = new InMemoryCaptureLedger();
  assert.equal(ledger.hasInjected('s1'), false);
  ledger.markInjected('s1');
  assert.equal(ledger.hasInjected('s1'), true);
  assert.equal(ledger.hasInjected('s2'), false);

  // In-memory only — not persisted to disk
  const ledger2 = new InMemoryCaptureLedger();
  assert.equal(ledger2.hasInjected('s1'), false);
});

// --- PM12: Plugin registration with two tools ---

test('plugin register registers bonfires_search, bonfires_stack_search, and bonfires_ingest_link tools (PM12, PM15)', async () => {
  const { default: register } = await import('../src/index.js');
  const events: any[] = [];
  const toolDefs: any[] = [];
  const api = {
    pluginConfig: { agents: { agent_primary: 'a1', agent_secondary: 'a2' }, apiKeyEnv: 'NO_SUCH_ENV' },
    resolvePath: (p: string) => p,
    logger: { warn: () => {} },
    on: (name: string, fn: any) => events.push([name, fn]),
    registerTool: (factory: any) => { toolDefs.push(factory); },
  };
  register(api);
  assert.equal(events.length, 4);
  assert.equal(toolDefs.length, 3);

  const searchTool = toolDefs.map(f => f({ agentId: 'agent_primary' })).find(t => t.name === 'bonfires_search');
  const stackSearchTool = toolDefs.map(f => f({ agentId: 'agent_primary' })).find(t => t.name === 'bonfires_stack_search');
  const ingestLinkTool = toolDefs.map(f => f({ agentId: 'agent_primary' })).find(t => t.name === 'bonfires_ingest_link');
  assert.ok(searchTool);
  assert.ok(stackSearchTool);
  assert.ok(ingestLinkTool);
  assert.ok(searchTool.description.includes('knowledge graph'));
  assert.ok(stackSearchTool.description.includes('unprocessed'));
  assert.ok(ingestLinkTool.description.includes('Ingest'));
});
