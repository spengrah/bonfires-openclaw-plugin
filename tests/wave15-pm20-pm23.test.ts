import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.js';
import { MockBonfiresClient } from '../src/bonfires-client.js';
import { InMemoryCaptureLedger } from '../src/capture-ledger.js';
import { createBonfiresContextEngine } from '../src/context-engine.js';

function wrap(msg: string) {
  return `Conversation info (untrusted metadata):\n\`\`\`json\n{"message_id": "$test"}\n\`\`\`\n\nSender (untrusted metadata):\n\`\`\`json\n{"name": "TestUser"}\n\`\`\`\n\n${msg}`;
}

test('PM20: afterTurn captures only post-turn delta from prePromptMessageCount', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  const engine = createBonfiresContextEngine({ cfg, client, ledger, defaultAgentId: 'agent_primary' });

  await engine.afterTurn?.({
    sessionId: 'sess-1',
    sessionFile: '/tmp/sess-1.jsonl',
    prePromptMessageCount: 2,
    messages: [
      { role: 'system', content: 'startup' },
      { role: 'user', content: wrap('old') },
      { role: 'user', content: wrap('new question') },
      { role: 'assistant', content: 'new answer' },
    ],
  } as any);

  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].sessionKey, 'sess-1');
  assert.equal(client.captureCalls[0].sessionId, 'sess-1');
  assert.equal(client.captureCalls[0].messages.length, 2);
  assert.deepEqual(client.captureCalls[0].messages.map((m: any) => m.role), ['user', 'assistant']);
  assert.equal(ledger.get('sess-1')?.lastPushedIndex, 3);
});


test('PM20: afterTurn remains delta-safe across repeated turns in the same session', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  const engine = createBonfiresContextEngine({ cfg, client, ledger, defaultAgentId: 'agent_primary' });

  await engine.afterTurn?.({
    sessionId: 'sess-repeat',
    prePromptMessageCount: 2,
    messages: [
      { role: 'system', content: 'startup' },
      { role: 'user', content: wrap('old') },
      { role: 'user', content: wrap('turn 1 question') },
      { role: 'assistant', content: 'turn 1 answer' },
    ],
  } as any);

  await engine.afterTurn?.({
    sessionId: 'sess-repeat',
    prePromptMessageCount: 4,
    messages: [
      { role: 'system', content: 'startup' },
      { role: 'user', content: wrap('old') },
      { role: 'user', content: wrap('turn 1 question') },
      { role: 'assistant', content: 'turn 1 answer' },
      { role: 'user', content: wrap('turn 2 question') },
      { role: 'assistant', content: 'turn 2 answer' },
    ],
  } as any);

  assert.equal(client.captureCalls.length, 2);
  assert.deepEqual(client.captureCalls[0].messages.map((m: any) => m.content), [wrap('turn 1 question'), 'turn 1 answer']);
  assert.deepEqual(client.captureCalls[1].messages.map((m: any) => m.content), [wrap('turn 2 question'), 'turn 2 answer']);
  assert.equal(ledger.get('sess-repeat')?.lastPushedIndex, 5);
});


test('PM20: afterTurn defaults missing prePromptMessageCount to zero', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  const engine = createBonfiresContextEngine({ cfg, client, ledger, defaultAgentId: 'agent_primary' });

  await engine.afterTurn?.({
    sessionId: 'sess-default-preprompt',
    messages: [{ role: 'user', content: wrap('hello') }],
  } as any);

  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].messages.length, 1);
  assert.equal(client.captureCalls[0].messages[0].content, wrap('hello'));
  assert.equal(ledger.get('sess-default-preprompt')?.lastPushedIndex, 0);
});

test('PM21: afterTurn remains fail-open on capture error', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  client.capture = async () => { throw new Error('capture boom'); };
  const warnings: string[] = [];
  const engine = createBonfiresContextEngine({ cfg, client, ledger: new InMemoryCaptureLedger(), defaultAgentId: 'agent_primary', logger: { warn: (m: string) => warnings.push(m) } });

  await engine.afterTurn?.({
    sessionId: 'sess-2',
    sessionFile: '/tmp/sess-2.jsonl',
    prePromptMessageCount: 0,
    messages: [{ role: 'user', content: wrap('hello') }],
  } as any);

  assert.ok(warnings.some((w) => w.includes('context_engine afterTurn error')));
});

test('PM22: assemble is default-off for dynamic retrieval but preserves stable system guidance', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.' },
  });
  const client = new MockBonfiresClient();
  const engine = createBonfiresContextEngine({ cfg, client, ledger: new InMemoryCaptureLedger(), defaultAgentId: 'agent_primary' });

  const out = await engine.assemble({
    sessionId: 'sess-3',
    messages: [{ role: 'user', content: wrap('hello') }],
    tokenBudget: 400,
  } as any);

  assert.equal(client.searchCalls.length, 0);
  assert.equal(out.messages.length, 1);
  assert.equal(out.systemPromptAddition, 'Stable guidance.');
});

test('PM22: assemble preserves stable guidance for empty message input', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.' },
  });
  const client = new MockBonfiresClient();
  const engine = createBonfiresContextEngine({ cfg, client, ledger: new InMemoryCaptureLedger(), defaultAgentId: 'agent_primary' });

  const out = await engine.assemble({
    sessionId: 'sess-empty',
    messages: [],
    tokenBudget: 400,
  } as any);

  assert.deepEqual(out.messages, []);
  assert.equal(out.estimatedTokens, 0);
  assert.equal(out.systemPromptAddition, 'Stable guidance.');
  assert.equal(client.searchCalls.length, 0);
});

test('PM22/PM23: assemble performs dynamic retrieval only when explicitly enabled', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.', enableDynamicRetrieval: true },
  });
  const client = new MockBonfiresClient();
  const engine = createBonfiresContextEngine({ cfg, client, ledger: new InMemoryCaptureLedger(), defaultAgentId: 'agent_primary' });

  const out = await engine.assemble({
    sessionId: 'sess-4',
    messages: [{ role: 'user', content: wrap('find relevant memory') }],
    tokenBudget: 400,
  } as any);

  assert.equal(client.searchCalls.length, 1);
  assert.equal(out.messages[0].role, 'system');
  assert.match(String(out.messages[0].content), /Bonfires context/);
  assert.equal(out.systemPromptAddition, 'Stable guidance.');
});

test('PM22/PM23: assemble also performs dynamic retrieval for raw user content', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.', enableDynamicRetrieval: true },
  });
  const client = new MockBonfiresClient();
  const engine = createBonfiresContextEngine({ cfg, client, ledger: new InMemoryCaptureLedger(), defaultAgentId: 'agent_primary' });

  const out = await engine.assemble({
    sessionId: 'sess-raw',
    messages: [{ role: 'user', content: 'find relevant memory' }],
    tokenBudget: 400,
  } as any);

  assert.equal(client.searchCalls.length, 1);
  assert.equal(client.searchCalls[0].query, 'find relevant memory');
  assert.equal(out.messages[0].role, 'system');
  assert.match(String(out.messages[0].content), /Bonfires context/);
  assert.equal(out.systemPromptAddition, 'Stable guidance.');
});

test('PM23: assemble is fail-open on retrieval failure', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.', enableDynamicRetrieval: true },
  });
  const client = new MockBonfiresClient();
  client.shouldThrowSearch = true;
  const warnings: string[] = [];
  const engine = createBonfiresContextEngine({ cfg, client, ledger: new InMemoryCaptureLedger(), defaultAgentId: 'agent_primary', logger: { warn: (m: string) => warnings.push(m) } });

  const out = await engine.assemble({
    sessionId: 'sess-5',
    messages: [{ role: 'user', content: wrap('hello') }],
    tokenBudget: 400,
  } as any);

  assert.equal(out.messages.length, 1);
  assert.equal(out.systemPromptAddition, 'Stable guidance.');
  assert.ok(warnings.some((w) => w.includes('context_engine assemble error')));
});

test('PM20/PM21: afterTurn skips capture and warns when sessionId is missing', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  const warnings: string[] = [];
  const engine = createBonfiresContextEngine({
    cfg, client, ledger, defaultAgentId: 'agent_primary',
    logger: { warn: (m: string) => warnings.push(m) },
  });

  await engine.afterTurn?.({
    messages: [{ role: 'user', content: wrap('hello') }],
    prePromptMessageCount: 0,
  } as any);

  assert.equal(client.captureCalls.length, 0, 'should not capture without sessionId');
  assert.ok(warnings.some((w) => w.includes('missing sessionId')));
});

test('PM20/PM21: afterTurn skips capture when sessionId is empty string', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  const warnings: string[] = [];
  const engine = createBonfiresContextEngine({
    cfg, client, ledger, defaultAgentId: 'agent_primary',
    logger: { warn: (m: string) => warnings.push(m) },
  });

  await engine.afterTurn?.({
    sessionId: '',
    messages: [{ role: 'user', content: wrap('hello') }],
    prePromptMessageCount: 0,
  } as any);

  assert.equal(client.captureCalls.length, 0, 'should not capture with empty sessionId');
  assert.ok(warnings.some((w) => w.includes('missing sessionId')));
});

test('PM22/PM23: assemble warns but still returns stable guidance when sessionId missing and dynamic retrieval enabled', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.', enableDynamicRetrieval: true },
  });
  const client = new MockBonfiresClient();
  const warnings: string[] = [];
  const engine = createBonfiresContextEngine({
    cfg, client, ledger: new InMemoryCaptureLedger(), defaultAgentId: 'agent_primary',
    logger: { warn: (m: string) => warnings.push(m) },
  });

  const out = await engine.assemble({
    messages: [{ role: 'user', content: 'hello' }],
    tokenBudget: 400,
  } as any);

  assert.ok(warnings.some((w) => w.includes('missing sessionId')));
  assert.equal(out.systemPromptAddition, 'Stable guidance.');
  assert.ok(out.messages.length >= 1, 'should still return messages');
  assert.equal(client.searchCalls.length, 1, 'dynamic retrieval still proceeds without sessionId');
});

test('PM21/PM23: plugin register activates context engine and deactivates before_agent_start/agent_end hooks', async () => {
  const { default: register } = await import('../src/index.js');
  const events: any[] = [];
  const engines: any[] = [];
  const toolDefs: any[] = [];
  const api = {
    pluginConfig: { agents: { agent_primary: 'a1' }, apiKeyEnv: 'NO_SUCH_ENV' },
    resolvePath: (p: string) => p,
    logger: { warn: () => {} },
    on: (name: string, fn: any) => events.push([name, fn]),
    registerTool: (factory: any) => { toolDefs.push(factory); },
    registerContextEngine: (id: string, factory: any) => { engines.push([id, factory]); },
  };
  register(api as any);
  assert.deepEqual(events.map(([name]) => name), ['session_end', 'before_compaction']);
  assert.equal(engines.length, 1);
  assert.equal(engines[0][0], 'bonfires');
  assert.equal(toolDefs.length, 6);
});
