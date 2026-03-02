import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedBonfiresClient, MockBonfiresClient, createBonfiresClient } from '../src/bonfires-client.js';

const cfg = {
  baseUrl: 'https://tnt-v2.api.bonfires.ai/',
  apiKeyEnv: 'DELVE_API_KEY',
  bonfireId: '507f1f77bcf86cd799439011',
};
const cfgWithTimeout = { ...cfg, network: { timeoutMs: 2500 } };
const cfgNoRetry = { ...cfg, network: { timeoutMs: 2500, retryBackoffMs: [0, 0] } };

test('hosted search maps delve response to normalized results', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, _init: any) => {
    return new Response(JSON.stringify({
      episodes: [{ uuid: 'e1', summary: 'Episode summary' }],
      entities: [{ uuid: 'n1', name: 'Entity name' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 5 });
    assert.equal(out.results.length >= 2, true);
    assert.equal(typeof out.results[0].summary, 'string');
    assert.equal(typeof out.results[0].source, 'string');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('mock search handles falsy limit branch', async () => {
  const m = new MockBonfiresClient();
  const out = await m.search({ agentId: 'a1', query: 'q', limit: 0 });
  assert.equal(out.results.length, 1);
});

test('hosted capture posts stack add per message and returns accepted count', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = (async (url: any, _init: any) => {
    hits.push(String(url));
    return new Response(JSON.stringify({ success: true, message_count: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.capture({ agentId: 'a1', sessionKey: 's1', messages: [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }] });
    assert.equal(hits.filter(h => h.includes('/agents/a1/stack/add')).length, 2);
    assert.equal(out.accepted, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted processStack hits process endpoint', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let hit = '';
  globalThis.fetch = (async (url: any, _init: any) => {
    hit = String(url);
    return new Response(JSON.stringify({ success: true, message_count: 3 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.processStack!({ agentId: 'a1' });
    assert.equal(hit.includes('/agents/a1/stack/process'), true);
    assert.equal(out.success, true);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted processStack defaults success true when field omitted', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.processStack!({ agentId: 'a1' });
    assert.equal(out.success, true);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted client throws when api key env is missing', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  delete process.env.DELVE_API_KEY;
  const c = new HostedBonfiresClient(cfg);
  await assert.rejects(async () => c.search({ agentId: 'a1', query: 'q', limit: 1 }));
  if (oldKey !== undefined) process.env.DELVE_API_KEY = oldKey;
});

test('hosted client rejects invalid agentId format', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const c = new HostedBonfiresClient(cfg);
  await assert.rejects(async () => c.search({ agentId: '../bad', query: 'q', limit: 1 }));
  if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
});

test('hosted search handles non-ok response', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ detail: 'bad' }), { status: 400, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    await assert.rejects(async () => c.search({ agentId: 'a1', query: 'q', limit: 1 }));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted capture returns zero accepted for empty message list', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const c = new HostedBonfiresClient(cfg);
  const out = await c.capture({ agentId: 'a1', sessionKey: 's1', messages: [] });
  assert.equal(out.accepted, 0);
  if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
});

test('hosted capture single-message payload path', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let body: any = null;
  globalThis.fetch = (async (_url: any, init: any) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ success: true, message_count: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.capture({ agentId: 'a1', sessionKey: 's1', messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(Boolean(body.message), true);
    assert.equal(Boolean(body.messages), false);
    assert.equal(out.accepted, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted capture with >2 messages does not drop and reports accepted count', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_url: any, _init: any) => {
    calls += 1;
    return new Response(JSON.stringify({ success: true, message_count: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.capture({
      agentId: 'a1',
      sessionKey: 's1',
      messages: [
        { role: 'user', content: 'm1' },
        { role: 'assistant', content: 'm2' },
        { role: 'user', content: 'm3' },
      ],
    });
    assert.equal(calls, 3);
    assert.equal(out.accepted, 3);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search returns normalized score values', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ episodes: [{ uuid: 'e1', summary: 'S', score: 0.99 }], entities: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 1 });
    assert.equal(typeof out.results[0].score, 'number');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search handles empty episodes/entities', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfgWithTimeout);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 3 });
    assert.equal(out.results.length, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search uses content/name fallbacks for summaries', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    episodes: [{ content: 'from-content' }],
    entities: [{ name: 'from-name' }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 2 });
    assert.equal(out.results[0].summary, 'from-content');
    assert.equal(out.results[1].summary, 'from-name');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search handles 200 non-json body path', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 3 });
    assert.equal(Array.isArray(out.results), true);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted processStack handles non-json error body path', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('oops', { status: 500, headers: { 'Content-Type': 'text/plain' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfgNoRetry);
    await assert.rejects(async () => c.processStack!({ agentId: 'a1' }));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('createBonfiresClient selects hosted when env+bonfire present', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const client = createBonfiresClient(cfg);
  assert.equal(client instanceof HostedBonfiresClient, true);
  if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
});

test('createBonfiresClient selects mock when env missing or bonfire missing', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  delete process.env.DELVE_API_KEY;
  const c1 = createBonfiresClient(cfg);
  assert.equal(c1 instanceof MockBonfiresClient, true);
  process.env.DELVE_API_KEY = 'x';
  const c2 = createBonfiresClient({ ...cfg, bonfireId: '' });
  assert.equal(c2 instanceof MockBonfiresClient, true);
  if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
});

test('createBonfiresClient strictHostedMode throws when hosted env missing', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  delete process.env.DELVE_API_KEY;
  assert.throws(() => createBonfiresClient({ ...cfg, strictHostedMode: true }));
  if (oldKey !== undefined) process.env.DELVE_API_KEY = oldKey;
});

test('mock client processStack path', async () => {
  const c = new MockBonfiresClient();
  const out = await c.processStack();
  assert.equal(out.success, true);
});

test('hosted capture accepted count tracks successful post calls', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, message_ids: ['m1'] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.capture({ agentId: 'a1', sessionKey: 's1', messages: [{ role: 'user', content: 'one' }] });
    assert.equal(out.accepted, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted ingestContent maps payload to ingest_content endpoint', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let hit = '';
  let body: any = null;
  globalThis.fetch = (async (url: any, init: any) => {
    hit = String(url);
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ accepted: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.ingestContent!({ sourcePath: 'memory/2026-03-02.md', content: 'abc', contentHash: 'sha256:123' });
    assert.equal(hit.includes('/ingest_content'), true);
    assert.equal(body.bonfire_id, cfg.bonfireId);
    assert.equal(body.source_path, 'memory/2026-03-02.md');
    assert.equal(body.content_hash, 'sha256:123');
    assert.equal(out.accepted, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});
