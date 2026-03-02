import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.js';
import { MockBonfiresClient } from '../src/bonfires-client.js';
import { InMemoryCaptureLedger } from '../src/capture-ledger.js';
import { handleBeforeAgentStart, handleAgentEnd } from '../src/hooks.js';
import { bonfiresSearchTool } from '../src/tools/bonfires-search.js';

const cfg = parseConfig({ agents: { lyle: 'a1', reviewer: 'a2' } });

test('before_agent_start calls search and returns prependContext', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart({ prompt: 'hello world' }, { agentId: 'lyle' }, { cfg, client });
  assert.equal(client.searchCalls.length, 1);
  assert.ok(res?.prependContext?.includes('Bonfires context'));
});

test('before_agent_start skips empty prompt', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart({ prompt: '   ' }, { agentId: 'lyle' }, { cfg, client });
  assert.equal(client.searchCalls.length, 0);
  assert.equal(res, undefined);
});

test('before_agent_start fail-open on search error', async () => {
  const client = new MockBonfiresClient();
  client.shouldThrowSearch = true;
  const res = await handleBeforeAgentStart({ prompt: 'x' }, { agentId: 'lyle' }, { cfg, client });
  assert.equal(res, undefined);
});

test('agent_end throttles per session', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  let now = 1000;
  const nowMs = () => now;
  const event = { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] };
  await handleAgentEnd(event, { agentId: 'lyle', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  await handleAgentEnd(event, { agentId: 'lyle', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 1);
  now += 16 * 60_000;
  await handleAgentEnd({ messages: [...event.messages, { role: 'user', content: 'c' }] }, { agentId: 'lyle', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 2);
});

test('bonfires_search validates query and returns deterministic shape', async () => {
  const client = new MockBonfiresClient();
  const out = await bonfiresSearchTool({ query: 'abc', limit: 2 }, { agentId: 'lyle' }, { cfg, client });
  assert.equal(out.results.length, 2);
  await assert.rejects(async () => bonfiresSearchTool({}, { agentId: 'lyle' }, { cfg, client }));
});

test('bonfires_search clamps limit to max 50', async () => {
  const client = new MockBonfiresClient();
  await bonfiresSearchTool({ query: 'abc', limit: 9999 }, { agentId: 'lyle' }, { cfg, client });
  assert.equal(client.searchCalls.at(-1).limit, 50);
});

test('before_agent_start truncates query to 500 chars', async () => {
  const client = new MockBonfiresClient();
  const longPrompt = 'a'.repeat(800);
  await handleBeforeAgentStart({ prompt: longPrompt }, { agentId: 'lyle' }, { cfg, client });
  assert.equal(client.searchCalls.length, 1);
  assert.equal(client.searchCalls[0].query.length, 500);
});

test('before_agent_start caps prependContext at 2000 chars', async () => {
  const client = new MockBonfiresClient();
  client.search = async () => ({
    results: Array.from({ length: 100 }, (_, i) => ({
      summary: `S${i}-` + 'x'.repeat(100),
      source: `mock://${i}`,
      score: 0.9,
    })),
  });
  const res = await handleBeforeAgentStart({ prompt: 'cap-test' }, { agentId: 'lyle' }, { cfg, client });
  assert.ok(res?.prependContext);
  assert.ok(res.prependContext.length <= 2000);
});

test('before_agent_start skips unknown agent mapping', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart({ prompt: 'hello' }, { agentId: 'unknown-agent' }, { cfg, client });
  assert.equal(res, undefined);
  assert.equal(client.searchCalls.length, 0);
});

test('agent_end skips when sessionKey is missing', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { agentId: 'lyle' }, { cfg, client, ledger });
  assert.equal(client.captureCalls.length, 0);
});

test('parseConfig rejects missing agent mappings', async () => {
  assert.throws(() => parseConfig({ agents: { lyle: 'a1' } }));
  assert.throws(() => parseConfig({ agents: { reviewer: 'a2' } }));
});

test('parseConfig validates numeric bounds', async () => {
  assert.throws(() => parseConfig({ agents: { lyle: 'a1', reviewer: 'a2' }, search: { maxResults: 0 } }));
  assert.throws(() => parseConfig({ agents: { lyle: 'a1', reviewer: 'a2' }, capture: { throttleMinutes: 0 } }));
});

test('resolveBonfiresAgentId ignores inherited prototype keys', async () => {
  const local = parseConfig({ agents: { lyle: 'a1', reviewer: 'a2' } });
  const { resolveBonfiresAgentId } = await import('../src/config.js');
  assert.equal(resolveBonfiresAgentId(local, '__proto__'), null);
});
