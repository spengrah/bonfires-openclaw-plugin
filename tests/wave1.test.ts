import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseConfig, resolveBonfiresAgentId } from '../src/config.js';
import { MockBonfiresClient } from '../src/bonfires-client.js';
import { InMemoryCaptureLedger } from '../src/capture-ledger.js';
import { handleBeforeAgentStart, handleAgentEnd, handleSessionEnd } from '../src/hooks.js';
import { bonfiresSearchTool } from '../src/tools/bonfires-search.js';
import register from '../src/index.js';

const cfg = parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' } });

test('before_agent_start calls search and returns prependContext', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart({ prompt: 'hello world' }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.searchCalls.length, 1);
  assert.ok(res?.prependContext?.includes('Bonfires context'));
});

test('before_agent_start skips empty prompt', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart({ prompt: '   ' }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.searchCalls.length, 0);
  assert.equal(res, undefined);
});

test('before_agent_start fail-open on search error', async () => {
  const client = new MockBonfiresClient();
  client.shouldThrowSearch = true;
  const res = await handleBeforeAgentStart({ prompt: 'x' }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(res, undefined);
});

test('agent_end throttles per session', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  let now = 1000;
  const nowMs = () => now;
  const event = { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] };
  await handleAgentEnd(event, { agentId: 'agent_primary', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  await handleAgentEnd(event, { agentId: 'agent_primary', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 1);
  now += 16 * 60_000;
  await handleAgentEnd({ messages: [...event.messages, { role: 'user', content: 'c' }] }, { agentId: 'agent_primary', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 2);
});

test('bonfires_search validates query and returns deterministic shape', async () => {
  const client = new MockBonfiresClient();
  const out = await bonfiresSearchTool({ query: 'abc', limit: 2 }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(out.results.length, 2);
  await assert.rejects(async () => bonfiresSearchTool({}, { agentId: 'agent_primary' }, { cfg, client }));
});

test('bonfires_search clamps limit to max 50', async () => {
  const client = new MockBonfiresClient();
  await bonfiresSearchTool({ query: 'abc', limit: 9999 }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.searchCalls.at(-1).limit, 50);
});

test('before_agent_start truncates query to 500 chars', async () => {
  const client = new MockBonfiresClient();
  const longPrompt = 'a'.repeat(800);
  await handleBeforeAgentStart({ prompt: longPrompt }, { agentId: 'agent_primary' }, { cfg, client });
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
  const res = await handleBeforeAgentStart({ prompt: 'cap-test' }, { agentId: 'agent_primary' }, { cfg, client });
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
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { agentId: 'agent_primary' }, { cfg, client, ledger });
  assert.equal(client.captureCalls.length, 0);
});

test('parseConfig requires at least one mapped agent id', async () => {
  assert.doesNotThrow(() => parseConfig({ agents: { agent_primary: 'a1' } }));
  assert.doesNotThrow(() => parseConfig({ agents: { any_agent: 'a2' } }));
  assert.throws(() => parseConfig({ agents: {} }));
});

test('parseConfig validates numeric bounds', async () => {
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, search: { maxResults: 0 } }));
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, capture: { throttleMinutes: 0 } }));
});

test('resolveBonfiresAgentId ignores inherited prototype keys', async () => {
  const local = parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' } });
  assert.equal(resolveBonfiresAgentId(local, '__proto__'), null);
});

test('resolveBonfiresAgentId handles missing agentId and unknown key', async () => {
  const local = parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' } });
  assert.equal(resolveBonfiresAgentId(local, undefined), null);
  assert.equal(resolveBonfiresAgentId(local, 'nope'), null);
  assert.equal(resolveBonfiresAgentId(local, 'agent_primary'), 'a1');
});

test('parseConfig uses defaults for optional values', async () => {
  const out = parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' } });
  assert.equal(out.baseUrl, 'https://tnt-v2.api.bonfires.ai/');
  assert.equal(out.apiKeyEnv, 'DELVE_API_KEY');
  assert.equal(out.search.maxResults, 5);
  assert.equal(out.capture.throttleMinutes, 15);
  assert.equal(out.network.timeoutMs, 12000);
});

test('parseConfig rejects non-finite numeric values', async () => {
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, search: { maxResults: Infinity } }));
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, capture: { throttleMinutes: NaN } }));
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, network: { timeoutMs: 0 } }));
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1' }, ingestion: { everyMinutes: 0 } }));
});

test('parseConfig ingestion defaults and mapped-agent validation', async () => {
  const out = parseConfig({ agents: { only: 'a1' } });
  assert.equal(out.ingestion.enabled, false);
  assert.equal(out.ingestion.everyMinutes, 1440);
  assert.equal(typeof out.ingestion.ledgerPath, 'string');
  assert.equal(typeof out.ingestion.summaryPath, 'string');
  assert.throws(() => parseConfig({ agents: { only: 123 } }));
});

test('parseConfig validates baseUrl host and protocol', async () => {
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, baseUrl: 'http://tnt-v2.api.bonfires.ai/' }));
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, baseUrl: 'https://evil.example.com/' }));
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, baseUrl: 'https://evilbonfires.ai/' }));
  const ok = parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, baseUrl: 'https://tnt-v2.api.bonfires.ai/' });
  assert.equal(ok.baseUrl, 'https://tnt-v2.api.bonfires.ai/');
});

test('before_agent_start returns undefined when result set is empty', async () => {
  const client = new MockBonfiresClient();
  client.search = async () => ({ results: [] });
  const res = await handleBeforeAgentStart({ prompt: 'x' }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(res, undefined);
});

test('before_agent_start handles missing results field from search response', async () => {
  const client = new MockBonfiresClient();
  client.search = async () => ({} as any);
  const res = await handleBeforeAgentStart({ prompt: 'x' }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(res, undefined);
});

test('agent_end skips unknown agent mapping', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { agentId: 'nope', sessionKey: 's2' }, { cfg, client, ledger });
  assert.equal(client.captureCalls.length, 0);
});

test('agent_end skips when there are no new messages since watermark', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  const nowMs = () => 10_000_000;
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { agentId: 'agent_primary', sessionKey: 's3' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 1);
  // Force no-throttle but no new messages branch
  ledger.set('s3', { lastPushedAt: 0, lastPushedIndex: 0 });
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { agentId: 'agent_primary', sessionKey: 's3' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 1);
});

test('handleSessionEnd is safe no-op', async () => {
  await handleSessionEnd({ sessionId: 'x' }, { sessionKey: 's' }, { logger: { warn: () => {} } });
  assert.ok(true);
});

test('session_end flush captures uncaptured tail immediately when messages are present', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }, { role: 'assistant', content: 'm1' }] },
    { agentId: 'agent_primary', sessionKey: 's-session-end' },
    { cfg, client, ledger, logger: { warn: () => {} }, nowMs: () => 42 },
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].messages.length, 2);
  assert.equal(ledger.get('s-session-end').lastPushedIndex, 1);
});

test('session_end flush respects endIndex <= lastPushedIndex guard', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  ledger.set('s-session-end-guard', { lastPushedAt: 1, lastPushedIndex: 1 });

  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }, { role: 'assistant', content: 'm1' }] },
    { agentId: 'agent_primary', sessionKey: 's-session-end-guard' },
    { cfg, client, ledger, logger: { warn: () => {} } },
  );

  assert.equal(client.captureCalls.length, 0);
});

test('session_end flush skips when sessionKey is missing', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }] },
    { agentId: 'agent_primary' },
    { cfg, client, ledger, logger: { warn: () => {} } },
  );
  assert.equal(client.captureCalls.length, 0);
});

test('session_end flush skips unknown agent mapping', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }] },
    { agentId: 'unknown-agent', sessionKey: 's-session-end-unknown' },
    { cfg, client, ledger, logger: { warn: () => {} } },
  );
  assert.equal(client.captureCalls.length, 0);
});

test('session_end flush catch path swallows capture errors', async () => {
  const client = new MockBonfiresClient();
  client.capture = async () => { throw new Error('session-end-boom'); };
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }] },
    { agentId: 'agent_primary', sessionKey: 's-session-end-catch' },
    { cfg, client, ledger, logger: { warn: () => {} } },
  );
  assert.equal(ledger.get('s-session-end-catch'), undefined);
});

test('session_end flush no-messages branch returns without capture', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    {},
    { agentId: 'agent_primary', sessionKey: 's-session-end-empty' },
    { cfg, client, ledger, logger: { warn: () => {} } },
  );
  assert.equal(client.captureCalls.length, 0);
});

test('session_end flush sets lastPushedAt from Date.now when nowMs is absent', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }] },
    { agentId: 'agent_primary', sessionKey: 's-session-end-now' },
    { cfg, client, ledger, logger: { warn: () => {} } },
  );
  const mark = ledger.get('s-session-end-now');
  assert.equal(typeof mark.lastPushedAt, 'number');
  assert.equal(mark.lastPushedIndex, 0);
});

test('session_end catch path is safe with non-Error throw and missing logger', async () => {
  const client = new MockBonfiresClient();
  client.capture = async () => { throw 'session-end-string-failure'; };
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }] },
    { agentId: 'agent_primary', sessionKey: 's-session-end-string-catch' },
    { cfg, client, ledger },
  );
  assert.equal(ledger.get('s-session-end-string-catch'), undefined);
});

test('capture ledger persists and reloads from disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bonfires-ledger-'));
  try {
    const path = join(dir, 'bonfires-ledger.json');
    const ledgerA = new InMemoryCaptureLedger(path, dir);
    ledgerA.set('s1', { lastPushedAt: 1, lastPushedIndex: 2 });
    const ledgerB = new InMemoryCaptureLedger(path, dir);
    assert.deepEqual(ledgerB.get('s1'), { lastPushedAt: 1, lastPushedIndex: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('capture ledger rejects unsafe path outside baseDir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bonfires-ledger-'));
  try {
    const unsafe = join(dir, '..', 'escape.json');
    assert.throws(() => new InMemoryCaptureLedger(unsafe, dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bonfires_search uses fallback maxResults when limit is NaN', async () => {
  const client = new MockBonfiresClient();
  await bonfiresSearchTool({ query: 'abc', limit: Number.NaN }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.searchCalls.at(-1).limit, cfg.search.maxResults);
});

test('bonfires_search clamps limit to minimum 1', async () => {
  const client = new MockBonfiresClient();
  await bonfiresSearchTool({ query: 'abc', limit: 0 }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.searchCalls.at(-1).limit, 1);
});

test('bonfires_search unknown agent without logger returns empty', async () => {
  const client = new MockBonfiresClient();
  const out = await bonfiresSearchTool({ query: 'abc' }, { agentId: 'unknown' }, { cfg, client, logger: undefined });
  assert.deepEqual(out, { results: [] });
});

test('resolveBonfiresAgentId returns null for non-string mapped value', async () => {
  const weird = { ...cfg, agents: { ...cfg.agents, agent_primary: 123 } };
  assert.equal(resolveBonfiresAgentId(weird, 'agent_primary'), null);
});

test('handleBeforeAgentStart handles unknown agent without logger safely', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart({ prompt: 'hello' }, { agentId: 'unknown' }, { cfg, client, logger: undefined });
  assert.equal(res, undefined);
});

test('handleAgentEnd uses Date.now path when nowMs is absent', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { agentId: 'agent_primary', sessionKey: 's-date-now' }, { cfg, client, ledger });
  assert.equal(client.captureCalls.length, 1);
});

test('handleAgentEnd catch path swallows capture errors', async () => {
  const client = new MockBonfiresClient();
  client.capture = async () => { throw new Error('boom'); };
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { agentId: 'agent_primary', sessionKey: 's-catch' }, { cfg, client, ledger, logger: { warn: () => {} } });
  assert.equal(ledger.get('s-catch'), undefined);
});

test('handleAgentEnd catch path is safe when logger is missing and error is non-Error', async () => {
  const client = new MockBonfiresClient();
  client.capture = async () => { throw 'string-failure'; };
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { agentId: 'agent_primary', sessionKey: 's-catch-nolog' }, { cfg, client, ledger });
  assert.equal(ledger.get('s-catch-nolog'), undefined);
});

test('before_agent_start handles undefined event and logger-present catch path', async () => {
  const client = new MockBonfiresClient();
  client.search = async () => { throw new Error('forced'); };
  let warned = false;
  const res1 = await handleBeforeAgentStart(undefined, { agentId: 'agent_primary' }, { cfg, client, logger: { warn: () => { warned = true; } } });
  assert.equal(res1, undefined);
  const res2 = await handleBeforeAgentStart({ prompt: 'x' }, { agentId: 'agent_primary' }, { cfg, client, logger: { warn: () => { warned = true; } } });
  assert.equal(res2, undefined);
  assert.equal(warned, true);
});

test('before_agent_start catch path is safe with non-Error throw and missing logger', async () => {
  const client = new MockBonfiresClient();
  client.search = async () => { throw 'forced-string'; };
  const res = await handleBeforeAgentStart({ prompt: 'x' }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(res, undefined);
});

test('agent_end handles unknown agent with missing agentId and logger', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd({ messages: [{ role: 'user', content: 'a' }] }, { sessionKey: 's-unknown' }, { cfg, client, ledger, logger: { warn: () => {} } });
  assert.equal(client.captureCalls.length, 0);
});

test('agent_end handles missing messages array branch', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd({}, { agentId: 'agent_primary', sessionKey: 's-empty-msg' }, { cfg, client, ledger, nowMs: () => 1000 });
  assert.equal(client.captureCalls.length, 0);
});

test('bonfires_search rejects non-string query', async () => {
  const client = new MockBonfiresClient();
  await assert.rejects(async () => bonfiresSearchTool({ query: 123 }, { agentId: 'agent_primary' }, { cfg, client }));
});

test('bonfires_search uses config default when limit omitted', async () => {
  const client = new MockBonfiresClient();
  await bonfiresSearchTool({ query: 'abc' }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.searchCalls.at(-1).limit, cfg.search.maxResults);
});

test('plugin register wires hooks and tool', async () => {
  const events = [];
  let toolDef = null;
  const api = {
    pluginConfig: { agents: { agent_primary: 'a1', agent_secondary: 'a2' }, apiKeyEnv: 'NO_SUCH_ENV' },
    resolvePath: (p) => p,
    logger: { warn: () => {} },
    on: (name, fn) => events.push([name, fn]),
    registerTool: (factory) => { toolDef = factory; },
  };
  register(api);
  assert.equal(events.length, 3);
  assert.ok(toolDef);
  const tool = toolDef({ agentId: 'agent_primary' });
  assert.equal(tool.name, 'bonfires_search');
  const result = await tool.execute('mock-tool-call-id', { query: 'hello', limit: 1 });
  assert.equal(Array.isArray(result.details.results), true);
});

test('plugin register fallback path works when resolvePath missing', async () => {
  const events = [];
  const api = {
    pluginConfig: { agents: { agent_primary: 'a1', agent_secondary: 'a2' } },
    logger: { warn: () => {} },
    on: (name, fn) => events.push([name, fn]),
    registerTool: () => {},
  };
  register(api);
  assert.equal(events.length, 3);
});

test('plugin register supports functional recovery source and enabled ingestion config', async () => {
  const events = [];
  const api = {
    pluginConfig: {
      agents: { agent_primary: 'a1', agent_secondary: 'a2' },
      ingestion: { enabled: true, everyMinutes: 60, ledgerPath: '.ai/log/plan/custom-ledger.json', summaryPath: '.ai/log/plan/custom-summary.json' },
    },
    resolvePath: (p) => p,
    getPersistedSessions: () => [],
    logger: { warn: () => {} },
    on: (name, fn) => events.push([name, fn]),
    registerTool: () => {},
  };
  register(api);
  assert.equal(events.length, 3);
});

test('plugin register throws when pluginConfig is missing required mappings', async () => {
  const api = {
    logger: { warn: () => {} },
    on: () => {},
    registerTool: () => {},
  };
  assert.throws(() => register(api));
});
