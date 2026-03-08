import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.js';
import { MockBonfiresClient } from '../src/bonfires-client.js';
import { InMemoryCaptureLedger } from '../src/capture-ledger.js';
import { handleBeforeAgentStart } from '../src/hooks.js';

/** Wrap a message with metadata so handleBeforeAgentStart treats it as a real user message. */
function wrap(msg: string) {
  return `Conversation info (untrusted metadata):\n\`\`\`json\n{"message_id": "$test"}\n\`\`\`\n\nSender (untrusted metadata):\n\`\`\`json\n{"name": "TestUser"}\n\`\`\`\n\n${msg}`;
}

// --- PM18: System-context placement for stable guidance ---

test('PM18: parseConfig accepts retrieval.systemGuidance string', () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'You have access to Bonfires episodic memory.' },
  });
  assert.equal(cfg.retrieval.systemGuidance, 'You have access to Bonfires episodic memory.');
});

test('PM18: parseConfig defaults retrieval.systemGuidance to undefined', () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  assert.equal(cfg.retrieval.systemGuidance, undefined);
});

test('PM18: parseConfig ignores empty/whitespace retrieval.systemGuidance', () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: '   ' },
  });
  assert.equal(cfg.retrieval.systemGuidance, undefined);
});

test('PM18: parseConfig ignores non-string retrieval.systemGuidance', () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 42 },
  });
  assert.equal(cfg.retrieval.systemGuidance, undefined);
});

test('PM18: handleBeforeAgentStart returns prependSystemContext when systemGuidance configured', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Bonfires stable guidance text.' },
  });
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client },
  );
  assert.ok(res);
  assert.equal(res.prependSystemContext, 'Bonfires stable guidance text.');
  assert.ok(res.prependContext?.includes('Bonfires context'));
});

test('PM18: handleBeforeAgentStart omits prependSystemContext when systemGuidance not configured', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client },
  );
  assert.ok(res);
  assert.equal(res.prependContext?.includes('Bonfires context'), true);
  assert.equal(res.prependSystemContext, undefined);
});

test('PM18: handleBeforeAgentStart returns only prependSystemContext when search results empty', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.' },
  });
  const client = new MockBonfiresClient();
  client.search = async () => ({ results: [] });
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client },
  );
  assert.ok(res);
  assert.equal(res.prependSystemContext, 'Stable guidance.');
  assert.equal(res.prependContext, undefined);
});

test('PM18: default behavior unchanged — prependContext only, no prependSystemContext', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client },
  );
  assert.ok(res);
  assert.ok('prependContext' in res);
  assert.ok(!('prependSystemContext' in res));
});

test('PM18: formatting boundary — prependSystemContext and prependContext are independent strings', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'System-level stable guidance.' },
  });
  const client = new MockBonfiresClient();
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client },
  );
  assert.ok(res);
  // Both fields present and independent
  assert.equal(typeof res.prependSystemContext, 'string');
  assert.equal(typeof res.prependContext, 'string');
  assert.notEqual(res.prependSystemContext, res.prependContext);
});

// --- PM19: Prompt-policy-aware fail-open behavior ---

test('PM19: handleBeforeAgentStart is fail-open on search error (no throw, no turn abort)', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  client.shouldThrowSearch = true;
  const warnings: string[] = [];
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client, logger: { warn: (m: string) => warnings.push(m) } },
  );
  assert.equal(res, undefined);
  assert.ok(warnings.some(w => w.includes('before_agent_start error')));
});

test('PM19: handleBeforeAgentStart is fail-open on search error with systemGuidance configured', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.' },
  });
  const client = new MockBonfiresClient();
  client.shouldThrowSearch = true;
  const warnings: string[] = [];
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client, logger: { warn: (m: string) => warnings.push(m) } },
  );
  // Fail-open: returns undefined, does not throw
  assert.equal(res, undefined);
  assert.ok(warnings.length > 0);
});

test('PM19: policy-constrained path degrades to no-op without throwing', async () => {
  const cfg = parseConfig({
    agents: { agent_primary: 'a1' },
    retrieval: { systemGuidance: 'Stable guidance.' },
  });
  const client = new MockBonfiresClient();
  const warnings: string[] = [];
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary', policy: { allowPromptInjection: false } },
    { cfg, client, logger: { warn: (m: string) => warnings.push(m) } },
  );
  // No throw, no search, no context injection
  assert.equal(res, undefined);
  assert.equal(client.searchCalls.length, 0);
  assert.ok(warnings.some(w => w.includes('prompt injection constrained by policy')));
});

test('PM19: fail-open emits structured diagnostic on non-Error throw', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  client.search = async () => { throw 'string-policy-error'; };
  const warnings: string[] = [];
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client, logger: { warn: (m: string) => warnings.push(m) } },
  );
  assert.equal(res, undefined);
  assert.ok(warnings.some(w => w.includes('string-policy-error')));
});

test('PM19: fail-open is safe when logger is absent', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  client.shouldThrowSearch = true;
  // No logger — should not throw
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client },
  );
  assert.equal(res, undefined);
});

test('PM19: existing Bonfires outage handling remains intact', async () => {
  const cfg = parseConfig({ agents: { agent_primary: 'a1' } });
  const client = new MockBonfiresClient();
  client.search = async () => { throw new Error('ECONNREFUSED'); };
  const res = await handleBeforeAgentStart(
    { prompt: wrap('hello') },
    { agentId: 'agent_primary' },
    { cfg, client, logger: { warn: () => {} } },
  );
  assert.equal(res, undefined);
});
