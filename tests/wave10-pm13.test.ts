import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.js';
import { MockBonfiresClient, HostedBonfiresClient } from '../src/bonfires-client.js';
import { InMemoryCaptureLedger } from '../src/capture-ledger.js';
import { handleAgentEnd, handleSessionEnd } from '../src/hooks.js';

const cfg = parseConfig({ agents: { main: 'a1', reviewer: 'a2' } });

// --- PM13: agent_end passes agentDisplayName to capture ---

test('handleAgentEnd passes agentDisplayName from deps (PM13)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd(
    { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] },
    { agentId: 'main', sessionKey: 'sk1', sessionId: 'sid1' },
    { cfg, client, ledger, logger: { warn: () => {} }, agentDisplayNames: { main: 'Lyle' } },
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].agentDisplayName, 'Lyle');
});

test('handleAgentEnd falls back to ctx.agentId when no display name (PM13)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd(
    { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] },
    { agentId: 'main', sessionKey: 'sk1', sessionId: 'sid1' },
    { cfg, client, ledger, logger: { warn: () => {} } },
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].agentDisplayName, 'main');
});

// --- PM13: session_end passes agentDisplayName to capture ---

test('handleSessionEnd passes agentDisplayName from deps (PM13)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] },
    { agentId: 'main', sessionKey: 'sk1', sessionId: 'sid1' },
    { cfg, client, ledger, logger: { warn: () => {} }, agentDisplayNames: { main: 'Lyle' } },
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].agentDisplayName, 'Lyle');
});

// --- PM13: register() builds agentDisplayNames from api.config.agents.list ---

test('register passes agentDisplayNames from api.config to bonfires context engine factory (PM13)', async () => {
  // Dynamic import to get a fresh evaluation for coverage
  const { default: register } = await import('../src/index.js');
  const events: [string, Function][] = [];
  const engines: [string, Function][] = [];
  const api = {
    pluginConfig: { agents: { main: 'a1' }, apiKeyEnv: 'NO_SUCH_ENV' },
    resolvePath: (p: string) => p,
    logger: { warn: () => {} },
    on: (name: string, fn: Function) => events.push([name, fn]),
    registerTool: () => {},
    registerContextEngine: (id: string, factory: Function) => engines.push([id, factory]),
    config: { agents: { list: [{ id: 'main', name: 'Lyle' }] } },
  };
  register(api);
  assert.equal(events.find(([name]) => name === 'agent_end'), undefined);
  assert.equal(engines.length, 1);
  const engine = engines[0][1]();
  const ctx: any = { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], sessionId: 'sid1', sessionFile: '/tmp/sid1.jsonl', prePromptMessageCount: 0 };
  await engine.afterTurn(ctx);
  assert.ok(true);
});

// --- PM13: HostedBonfiresClient uses agentDisplayName for assistant userId/username ---

test('hosted capture uses agentDisplayName for assistant messages (PM13)', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const hostedCfg = parseConfig({ agents: { main: 'a1' }, bonfireId: 'bf1' });

  const oldFetch = globalThis.fetch;
  const payloads: any[] = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    payloads.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;

  try {
    const c = new HostedBonfiresClient(hostedCfg);
    await c.capture({
      agentId: 'a1',
      sessionKey: 'sk1',
      sessionId: 'sid1',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
      agentDisplayName: 'Lyle',
    });
    assert.equal(payloads.length, 1);
    const assistantMsg = payloads[0].messages.find((m: any) => m.role === 'assistant');
    assert.equal(assistantMsg.userId, 'Lyle');
    assert.equal(assistantMsg.username, 'Lyle');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted capture falls back to agentId when no agentDisplayName (PM13)', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const hostedCfg = parseConfig({ agents: { main: 'a1' }, bonfireId: 'bf1' });

  const oldFetch = globalThis.fetch;
  const payloads: any[] = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    payloads.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;

  try {
    const c = new HostedBonfiresClient(hostedCfg);
    await c.capture({
      agentId: 'a1',
      sessionKey: 'sk1',
      sessionId: 'sid1',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });
    assert.equal(payloads.length, 1);
    const assistantMsg = payloads[0].messages.find((m: any) => m.role === 'assistant');
    assert.equal(assistantMsg.userId, 'a1');
    assert.equal(assistantMsg.username, 'a1');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});
