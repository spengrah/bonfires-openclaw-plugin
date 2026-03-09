import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseConfig, resolveBonfiresAgentId } from '../src/config.js';
import { MockBonfiresClient, HostedBonfiresClient } from '../src/bonfires-client.js';
import { InMemoryCaptureLedger } from '../src/capture-ledger.js';
import { handleBeforeAgentStart, handleAgentEnd, handleBeforeCompaction, handleSessionEnd } from '../src/hooks.js';
import { extractUserMessage, hasUserMetadata } from '../src/message-utils.js';
import { bonfiresSearchTool } from '../src/tools/bonfires-search.js';
import register from '../src/index.js';

const cfg = parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' } });

/** Wrap a message with metadata so handleBeforeAgentStart treats it as a real user message. */
function wrap(msg: string) {
  return `Conversation info (untrusted metadata):\n\`\`\`json\n{"message_id": "$test"}\n\`\`\`\n\nSender (untrusted metadata):\n\`\`\`json\n{"name": "TestUser"}\n\`\`\`\n\n${msg}`;
}

test('before_agent_start calls search and returns prependContext', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart({ prompt: wrap('hello world') }, { agentId: 'agent_primary' }, { cfg, client });
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
  const res = await handleBeforeAgentStart({ prompt: wrap('x') }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(res, undefined);
});

test('agent_end captures every turn without throttle (PM10)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  let now = 1000;
  const nowMs = () => now;
  const event = { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] };
  await handleAgentEnd(event, { agentId: 'agent_primary', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 1);
  // Second call with same messages — no new messages, so no capture
  await handleAgentEnd(event, { agentId: 'agent_primary', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 1);
  // Third call with new message — should capture immediately (no throttle)
  await handleAgentEnd({ messages: [...event.messages, { role: 'user', content: 'c' }] }, { agentId: 'agent_primary', sessionKey: 's1' }, { cfg, client, ledger, nowMs });
  assert.equal(client.captureCalls.length, 2);
  assert.equal(client.captureCalls[1].messages.length, 1);
  assert.equal(client.captureCalls[1].messages[0].content, 'c');
});

test('agent_end does not call processStack (PM10)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleAgentEnd(
    { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] },
    { agentId: 'agent_primary', sessionKey: 's-no-process' },
    { cfg, client, ledger, nowMs: () => 1000 },
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.processStackCalls.length, 0);
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
  const longPrompt = wrap('a'.repeat(800));
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
  const res = await handleBeforeAgentStart({ prompt: wrap('cap-test') }, { agentId: 'agent_primary' }, { cfg, client });
  assert.ok(res?.prependContext);
  assert.ok(res.prependContext.length <= 2000);
});

test('before_agent_start skips unknown agent mapping', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart({ prompt: wrap('hello') }, { agentId: 'unknown-agent' }, { cfg, client });
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
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, processing: { intervalMinutes: 0 } }));
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
  assert.equal(out.processing.intervalMinutes, 20);
  assert.equal(out.network.timeoutMs, 12000);
});

test('parseConfig rejects non-finite numeric values', async () => {
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, search: { maxResults: Infinity } }));
  assert.throws(() => parseConfig({ agents: { agent_primary: 'a1', agent_secondary: 'a2' }, processing: { intervalMinutes: NaN } }));
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
  const res = await handleBeforeAgentStart({ prompt: wrap('x') }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(res, undefined);
});

test('before_agent_start handles missing results field from search response', async () => {
  const client = new MockBonfiresClient();
  client.search = async () => ({} as any);
  const res = await handleBeforeAgentStart({ prompt: wrap('x') }, { agentId: 'agent_primary' }, { cfg, client });
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

test('session_end calls processStack after capture (PM10)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }, { role: 'assistant', content: 'm1' }] },
    { agentId: 'agent_primary', sessionKey: 's-session-process' },
    { cfg, client, ledger, logger: { warn: () => {} }, nowMs: () => 42 },
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.processStackCalls.length, 1);
});

test('session_end swallows processStack error without affecting capture', async () => {
  const client = new MockBonfiresClient();
  client.processStack = async () => { throw new Error('process-boom'); };
  const ledger = new InMemoryCaptureLedger();
  const warnings: string[] = [];
  await handleSessionEnd(
    { messages: [{ role: 'user', content: 'm0' }] },
    { agentId: 'agent_primary', sessionKey: 's-session-process-err' },
    { cfg, client, ledger, logger: { warn: (m: string) => warnings.push(m) }, nowMs: () => 42 },
  );
  // Capture still happened
  assert.equal(client.captureCalls.length, 1);
  assert.equal(ledger.get('s-session-process-err').lastPushedIndex, 0);
  // processStack error logged
  assert.ok(warnings.some(w => w.includes('session_end processStack')));
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

test('capture ledger persists injected sessions across restart when path is configured', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bonfires-ledger-'));
  try {
    const path = join(dir, 'bonfires-ledger.json');
    const ledgerA = new InMemoryCaptureLedger(path, dir);
    ledgerA.markInjected('sess-1');

    const ledgerB = new InMemoryCaptureLedger(path, dir);
    assert.equal(ledgerB.hasInjected('sess-1'), true);
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
  const res = await handleBeforeAgentStart({ prompt: wrap('hello') }, { agentId: 'unknown' }, { cfg, client, logger: undefined });
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
  const res2 = await handleBeforeAgentStart({ prompt: wrap('x') }, { agentId: 'agent_primary' }, { cfg, client, logger: { warn: () => { warned = true; } } });
  assert.equal(res2, undefined);
  assert.equal(warned, true);
});

test('before_agent_start catch path is safe with non-Error throw and missing logger', async () => {
  const client = new MockBonfiresClient();
  client.search = async () => { throw 'forced-string'; };
  const res = await handleBeforeAgentStart({ prompt: wrap('x') }, { agentId: 'agent_primary' }, { cfg, client });
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
  const toolDefs: any[] = [];
  const api = {
    pluginConfig: { agents: { agent_primary: 'a1', agent_secondary: 'a2' }, apiKeyEnv: 'NO_SUCH_ENV' },
    resolvePath: (p) => p,
    logger: { warn: () => {} },
    on: (name, fn) => events.push([name, fn]),
    registerTool: (factory) => { toolDefs.push(factory); },
    registerContextEngine: () => {},
  };
  register(api);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(([name]) => name), ['session_end', 'before_compaction']);
  assert.ok(toolDefs.length >= 3);
  const tools = toolDefs.map(f => f({ agentId: 'agent_primary' }));
  const searchTool = tools.find(t => t.name === 'bonfires_search');
  assert.ok(searchTool);
  const result = await searchTool.execute('mock-tool-call-id', { query: 'hello', limit: 1 });
  assert.equal(Array.isArray(result.details.results), true);
});

test('plugin register fallback path works when resolvePath missing', async () => {
  const events = [];
  const api = {
    pluginConfig: { agents: { agent_primary: 'a1', agent_secondary: 'a2' } },
    logger: { warn: () => {} },
    on: (name, fn) => events.push([name, fn]),
    registerTool: () => {},
    registerContextEngine: () => {},
  };
  register(api);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(([name]) => name), ['session_end', 'before_compaction']);
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
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(([name]) => name), ['session_end', 'before_compaction']);
});

test('plugin register throws when pluginConfig is missing required mappings', async () => {
  const api = {
    logger: { warn: () => {} },
    on: () => {},
    registerTool: () => {},
  };
  assert.throws(() => register(api));
});

// --- extractUserMessage tests (OpenClaw 2026.3.2 metadata wrapper) ---

const WRAPPED_PROMPT = `Conversation info (untrusted metadata):
\`\`\`json
{
  "message_id": "$abc123",
  "sender_id": "@user:matrix.org",
  "sender": "TestUser",
  "timestamp": "Thu 2026-03-05 17:46 CST"
}
\`\`\`

Sender (untrusted metadata):
\`\`\`json
{
  "label": "TestUser (@user:matrix.org)",
  "id": "@user:matrix.org",
  "name": "TestUser",
  "username": "testuser"
}
\`\`\`

tell me about cocktails`;

test('extractUserMessage strips metadata wrapper and returns user message', () => {
  const result = extractUserMessage(WRAPPED_PROMPT);
  assert.equal(result, 'tell me about cocktails');
});

test('extractUserMessage returns raw prompt when no metadata wrapper present', () => {
  const result = extractUserMessage('hello world');
  assert.equal(result, 'hello world');
});

test('extractUserMessage preserves normal json code blocks in user content', () => {
  const input = 'here is config\n```json\n{"mode":"safe"}\n```\nplease review';
  const result = extractUserMessage(input);
  assert.equal(result, input);
});

test('extractUserMessage strips metadata wrappers but keeps trailing user json code block', () => {
  const withJson = `${WRAPPED_PROMPT}\n\n\`\`\`json\n{"topic":"cocktails"}\n\`\`\``;
  const result = extractUserMessage(withJson);
  assert.equal(result, 'tell me about cocktails\n\n```json\n{"topic":"cocktails"}\n```');
});

test('extractUserMessage returns empty string for empty/whitespace input', () => {
  assert.equal(extractUserMessage(''), '');
  assert.equal(extractUserMessage('   '), '');
  assert.equal(extractUserMessage(undefined as any), '');
});

test('before_agent_start extracts user message from metadata-wrapped prompt', async () => {
  const client = new MockBonfiresClient();
  await handleBeforeAgentStart({ prompt: WRAPPED_PROMPT }, { agentId: 'agent_primary' }, { cfg, client });
  assert.equal(client.searchCalls.length, 1);
  assert.equal(client.searchCalls[0].query, 'tell me about cocktails');
});


test('before_agent_start skips system-generated messages without metadata wrapper', async () => {
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart(
    { prompt: 'A new session was started via /new or /reset. Execute your Session Startup sequence now.' },
    { agentId: 'agent_primary' },
    { cfg, client },
  );
  assert.equal(client.searchCalls.length, 0);
  assert.equal(res, undefined);
});

test('hasUserMetadata detects metadata wrapper presence', () => {
  assert.equal(hasUserMetadata(wrap('hello')), true);
  assert.equal(hasUserMetadata('plain message'), false);
  assert.equal(hasUserMetadata(''), false);
});

// --- PM7: before_compaction flush tests ---

test('before_compaction calls processStack and resets watermark to -1 (PM10)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  ledger.set('sess1', {lastPushedAt: 0, lastPushedIndex: 5});
  await handleBeforeCompaction(
    {},
    {sessionKey: 'sess1', agentId: 'agent_primary'},
    {cfg, client, ledger, logger: undefined, nowMs: () => 42}
  );
  // Should call processStack (not capture)
  assert.equal(client.captureCalls.length, 0);
  assert.equal(client.processStackCalls.length, 1);
  // Watermark should be reset to -1
  const mark = ledger.get('sess1');
  assert.equal(mark.lastPushedIndex, -1);
});

test('before_compaction resets watermark even with no prior watermark (PM10)', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleBeforeCompaction(
    {},
    {sessionKey: 'sess1', agentId: 'agent_primary'},
    {cfg, client, ledger, logger: undefined, nowMs: () => 42}
  );
  assert.equal(client.processStackCalls.length, 1);
  const mark = ledger.get('sess1');
  assert.equal(mark.lastPushedIndex, -1);
});

test('before_compaction is non-blocking on processStack error (PM10)', async () => {
  const client = new MockBonfiresClient();
  client.processStack = async () => { throw new Error('network down'); };
  const ledger = new InMemoryCaptureLedger();
  const warnings: string[] = [];
  await handleBeforeCompaction(
    {},
    {sessionKey: 'sess1', agentId: 'agent_primary'},
    {cfg, client, ledger, logger: {warn: (m:string) => warnings.push(m)}, nowMs: () => 42}
  );
  assert.ok(warnings.some(w => w.includes('before_compaction processStack')));
  // Watermark still reset despite processStack failure
  const mark = ledger.get('sess1');
  assert.equal(mark.lastPushedIndex, -1);
});

test('before_compaction skips unknown agent mapping', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleBeforeCompaction(
    {messages: [{role:'user',content:'msg1'}]},
    {sessionKey: 'sess1', agentId: 'unknown_agent'},
    {cfg, client, ledger, logger: undefined}
  );
  assert.equal(client.captureCalls.length, 0);
});

test('before_compaction skips missing sessionKey', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  await handleBeforeCompaction(
    {messages: [{role:'user',content:'msg1'}]},
    {agentId: 'agent_primary'},
    {cfg, client, ledger, logger: undefined}
  );
  assert.equal(client.captureCalls.length, 0);
});

// --- PM8: watermark reset on truncation tests ---

test('agent_end resets watermark when lastPushedIndex >= msgs.length', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  // Simulate post-compaction: ledger says index 109 but only 50 messages
  ledger.set('sess1', {lastPushedAt: 0, lastPushedIndex: 109});
  const msgs = Array.from({length: 50}, (_, i) => ({role: i%2===0?'user':'assistant', content: `msg${i}`}));
  const warnings: string[] = [];
  await handleAgentEnd(
    {messages: msgs},
    {sessionKey: 'sess1', agentId: 'agent_primary'},
    {cfg, client, ledger, logger: {warn: (m:string) => warnings.push(m)}, nowMs: () => 999999999}
  );
  // Should have captured all 50 messages from index 0
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].messages.length, 50);
  // Should have logged a warning
  assert.ok(warnings.some(w => w.includes('watermark reset')));
  // Watermark should be updated to new length
  const mark = ledger.get('sess1');
  assert.equal(mark.lastPushedIndex, 49);
});

test('session_end resets watermark when lastPushedIndex >= msgs.length', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  ledger.set('sess1', {lastPushedAt: 0, lastPushedIndex: 109});
  const msgs = Array.from({length: 30}, (_, i) => ({role: i%2===0?'user':'assistant', content: `msg${i}`}));
  const warnings: string[] = [];
  await handleSessionEnd(
    {messages: msgs},
    {sessionKey: 'sess1', agentId: 'agent_primary'},
    {cfg, client, ledger, logger: {warn: (m:string) => warnings.push(m)}, nowMs: () => 999999999}
  );
  assert.equal(client.captureCalls.length, 1);
  assert.equal(client.captureCalls[0].messages.length, 30);
  assert.ok(warnings.some(w => w.includes('watermark reset')));
});

// --- PM9: prependContext stripping tests ---

test('capture strips prependContext from user messages', async () => {
  const client = new MockBonfiresClient();
  const ledger = new InMemoryCaptureLedger();
  const prepended = '--- Bonfires context ---\n- Mock memory 1 (source: mock, relevance: 0.9)\n---\nhello world';
  const msgs = [{role:'user', content: prepended}, {role:'assistant', content:'response'}];
  await handleAgentEnd(
    {messages: msgs},
    {sessionKey: 'sess1', agentId: 'agent_primary'},
    {cfg, client, ledger, logger: undefined, nowMs: () => 999999999}
  );
  assert.equal(client.captureCalls.length, 1);
  // The mock client receives the raw messages; stripping happens in HostedBonfiresClient.
  // To test stripping directly, we test the HostedBonfiresClient's private method via capture behavior.
});

test('HostedBonfiresClient strips prependContext from user messages in capture', async () => {
  const client = new HostedBonfiresClient({apiKeyEnv: 'NONEXISTENT_KEY', baseUrl: 'http://localhost:1', bonfireId: 'test'});
  const strip = (client as any).stripPrependContext.bind(client);
  
  assert.equal(strip('--- Bonfires context ---\n- memory 1 (source: mock, relevance: 0.9)\n---\nhello world'), 'hello world');
  assert.equal(strip('--- Bonfires context ---\n- memory 1 (source: a, relevance: 0.9)\n- memory 2 (source: b, relevance: 0.8)\n---\nactual question'), 'actual question');
  assert.equal(strip('plain message'), 'plain message');
  assert.equal(strip('--- Bonfires context ---\n- memory 1 (source: mock, relevance: 0.9)\n---'), '');
  assert.equal(strip('some text\n--- Bonfires context ---\n- memory\n---'), 'some text\n--- Bonfires context ---\n- memory\n---');
});

// --- PM11: capture message sanitization tests ---

test('extractSenderFromMetadata parses sender name from metadata wrapper', () => {
  const client = new HostedBonfiresClient({apiKeyEnv: 'NONEXISTENT_KEY', baseUrl: 'http://localhost:1', bonfireId: 'test'});
  const extract = (client as any).extractSenderFromMetadata.bind(client);

  const withSender = 'Sender (untrusted metadata):\n```json\n{"label": "Spencer (@spengrah:matrix.org)", "id": "@spengrah:matrix.org", "name": "Spencer", "username": "spengrah"}\n```\nhello';
  assert.equal(extract(withSender), 'Spencer');

  // Falls back to username when name is missing
  const usernameOnly = 'Sender (untrusted metadata):\n```json\n{"id": "@foo:matrix.org", "username": "foobar"}\n```\nhello';
  assert.equal(extract(usernameOnly), 'foobar');

  // Falls back to id when name and username missing
  const idOnly = 'Sender (untrusted metadata):\n```json\n{"id": "@foo:matrix.org"}\n```\nhello';
  assert.equal(extract(idOnly), '@foo:matrix.org');

  // Returns null when no metadata
  assert.equal(extract('plain message'), null);

  // Returns null on malformed JSON
  assert.equal(extract('Sender (untrusted metadata):\n```json\n{broken json}\n```\nhello'), null);
});

test('toStackMsg cleans user messages: strips prependContext, metadata, resolves userId (PM11)', () => {
  const client = new HostedBonfiresClient({apiKeyEnv: 'NONEXISTENT_KEY', baseUrl: 'http://localhost:1', bonfireId: 'test'});
  const toStackMsg = (client as any).toStackMsg.bind(client);

  // Full metadata-wrapped user message with prependContext
  const wrapped = '--- Bonfires context ---\n- memory 1 (source: mock, relevance: 0.9)\n---\nConversation info (untrusted metadata):\n```json\n{"message_id": "$abc", "sender": "Spencer"}\n```\n\nSender (untrusted metadata):\n```json\n{"name": "Spencer", "id": "@spengrah:matrix.org", "username": "spengrah"}\n```\n\nhello world';
  const msg = toStackMsg({role: 'user', content: wrapped}, 'session-1', 'lyle-agent');
  assert.equal(msg.text, 'hello world');
  assert.equal(msg.userId, 'Spencer');
  assert.equal(msg.chatId, 'session-1');
  assert.equal(typeof msg.timestamp, 'string');
  // 6 fields per Bonfires API (PM12: added role, username)
  assert.deepEqual(Object.keys(msg).sort(), ['chatId', 'role', 'text', 'timestamp', 'userId', 'username']);

  // Plain user message without metadata — userId falls back to 'user'
  const plain = toStackMsg({role: 'user', content: 'just a plain message'}, 'session-1', 'lyle-agent');
  assert.equal(plain.text, 'just a plain message');
  assert.equal(plain.userId, 'user');
});

test('toStackMsg cleans assistant messages: strips thinking, toolCalls, [[directives]] (PM11)', () => {
  const client = new HostedBonfiresClient({apiKeyEnv: 'NONEXISTENT_KEY', baseUrl: 'http://localhost:1', bonfireId: 'test'});
  const toStackMsg = (client as any).toStackMsg.bind(client);

  // Assistant with mixed block types (realistic OpenClaw format)
  const mixedBlocks = [
    {type: 'thinking', thinking: 'internal reasoning'},
    {type: 'text', text: '[[reply_to_current]]Here is my response'},
    {type: 'toolCall', name: 'read', arguments: {file_path: '/tmp/x'}},
  ];
  const msg = toStackMsg({role: 'assistant', content: mixedBlocks}, 'session-1', 'my-agent');
  assert.equal(msg.text, 'Here is my response');
  assert.equal(msg.userId, 'my-agent');
  assert.deepEqual(Object.keys(msg).sort(), ['chatId', 'role', 'text', 'timestamp', 'userId', 'username']);

  // Assistant with no text blocks (pure tool call) — returns null
  const toolOnly = [
    {type: 'thinking', thinking: 'deciding'},
    {type: 'toolCall', name: 'write', arguments: {}},
  ];
  assert.equal(toStackMsg({role: 'assistant', content: toolOnly}, 'session-1', 'my-agent'), null);

  // Assistant with plain string content (no blocks)
  const plainAssistant = toStackMsg({role: 'assistant', content: '[[reply_to_current]]Plain string response'}, 'session-1', 'my-agent');
  assert.equal(plainAssistant.text, 'Plain string response');
  assert.equal(plainAssistant.userId, 'my-agent');

  // Assistant without agentName falls back to 'assistant'
  const noAgent = toStackMsg({role: 'assistant', content: 'response'}, 'session-1');
  assert.equal(noAgent.userId, 'assistant');
});

test('toStackMsg handles user content block arrays (PM11)', () => {
  const client = new HostedBonfiresClient({apiKeyEnv: 'NONEXISTENT_KEY', baseUrl: 'http://localhost:1', bonfireId: 'test'});
  const toStackMsg = (client as any).toStackMsg.bind(client);

  const arrayContent = [{type: 'text', text: 'Sender (untrusted metadata):\n```json\n{"name": "Spencer"}\n```\n\nhello from array'}];
  const msg = toStackMsg({role: 'user', content: arrayContent}, 'session-1', 'agent');
  assert.equal(msg.text, 'hello from array');
  assert.equal(msg.userId, 'Spencer');
});

test('toStackMsg assistant with multiple text blocks joins them (PM11)', () => {
  const client = new HostedBonfiresClient({apiKeyEnv: 'NONEXISTENT_KEY', baseUrl: 'http://localhost:1', bonfireId: 'test'});
  const toStackMsg = (client as any).toStackMsg.bind(client);

  const blocks = [
    {type: 'text', text: '[[reply_to_current]]First part'},
    {type: 'thinking', thinking: 'internal'},
    {type: 'text', text: 'Second part'},
  ];
  const msg = toStackMsg({role: 'assistant', content: blocks}, 'session-1', 'agent');
  assert.equal(msg.text, 'First part\nSecond part');
});
