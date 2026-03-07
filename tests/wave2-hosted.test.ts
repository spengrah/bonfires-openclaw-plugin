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

test('hosted capture sends user+assistant pair with is_paired:true', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ success: true, message_count: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.capture({ agentId: 'a1', sessionKey: 's1', messages: [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }] });
    assert.equal(bodies.length, 1, 'should send one paired request');
    assert.equal(bodies[0].is_paired, true);
    assert.equal(Array.isArray(bodies[0].messages), true);
    assert.equal(bodies[0].messages.length, 2);
    assert.equal(bodies[0].messages[0].userId, 'user');
    assert.equal(bodies[0].messages[1].userId, 'a1');
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

test('hosted capture pairs user+assistant and sends trailing single', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    bodies.push(JSON.parse(String(init.body)));
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
    assert.equal(bodies.length, 2, '1 paired + 1 single');
    assert.equal(bodies[0].is_paired, true);
    assert.equal(bodies[0].messages.length, 2);
    assert.equal(Boolean(bodies[1].message), true, 'trailing single uses message field');
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

test('hosted capture extracts text from array content blocks', async () => {
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
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hello' }, { type: 'tool_use', id: 't1' }, { type: 'text', text: 'world' }] as any }],
    });
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].message.text, 'hello\nworld');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted capture skips messages with empty text content', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.capture({
      agentId: 'a1',
      sessionKey: 's1',
      messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 't1' }] as any }],
    });
    assert.equal(calls, 0, 'no fetch for empty-text message');
    assert.equal(out.accepted, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search parses JSON episode content and extracts inner content field', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  const episodeJson = JSON.stringify({ name: 'Test Episode', content: 'The actual episode summary text', updates: [] });
  globalThis.fetch = (async () => new Response(JSON.stringify({
    episodes: [{ summary: null, content: episodeJson }],
    entities: [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 5 });
    assert.equal(out.results[0].summary, 'The actual episode summary text');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search strips newlines from summaries', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    episodes: [],
    entities: [{ summary: 'line1\nline2\nline3' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 5 });
    assert.equal(out.results[0].summary.includes('\n'), false);
    assert.equal(out.results[0].summary, 'line1 line2 line3');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted capture message includes required stack/add fields', async () => {
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
    await c.capture({ agentId: 'a1', sessionKey: 'sess1', messages: [{ role: 'user', content: 'hello' }] });
    const msg = body.message;
    assert.equal(msg.text, 'hello');
    assert.equal(msg.userId, 'user');
    assert.equal(msg.chatId, 'sess1');
    assert.equal(typeof msg.timestamp, 'string');
    // 6 fields per Bonfires API (PM12: added role, username)
    assert.deepEqual(Object.keys(msg).sort(), ['chatId', 'role', 'text', 'timestamp', 'userId', 'username']);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search handles object-typed summary without [object Object]', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    episodes: [{ summary: { content: 'nested', name: 'also nested' }, name: 'Episode Name' }],
    entities: [{ summary: { detail: 'nested obj' }, name: { also: 'nested' } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 5 });
    // Episode: summary is object, should fall through to e.name (string)
    assert.equal(out.results[0].summary, 'Episode Name');
    assert.equal(out.results[0].summary.includes('[object Object]'), false);
    // Entity: both summary and name are objects, should fall back to 'Entity'
    assert.equal(out.results[1].summary, 'Entity');
    assert.equal(out.results[1].summary.includes('[object Object]'), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search handles nested object in parsed episode content', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  const nestedContent = JSON.stringify({ content: { nested: 'structure' }, name: { also: 'nested' } });
  globalThis.fetch = (async () => new Response(JSON.stringify({
    episodes: [{ summary: null, content: nestedContent, name: 'Fallback Name' }],
    entities: [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 5 });
    // content and name in parsed JSON are both objects, should fall to e.name
    assert.equal(out.results[0].summary, 'Fallback Name');
    assert.equal(out.results[0].summary.includes('[object Object]'), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});

test('hosted search extracts content from object-typed episode.content (Bonfires API format)', async () => {
  const oldKey = process.env.DELVE_API_KEY;
  process.env.DELVE_API_KEY = 'x';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    episodes: [{
      summary: null,
      content: { name: 'Brief Exchange', content: 'A conversational exchange occurred.', updates: [] },
      name: 'Brief Exchange',
    }],
    entities: [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  try {
    const c = new HostedBonfiresClient(cfg);
    const out = await c.search({ agentId: 'a1', query: 'q', limit: 5 });
    assert.equal(out.results[0].summary, 'A conversational exchange occurred.');
    assert.equal(out.results[0].summary.includes('[object Object]'), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DELVE_API_KEY; else process.env.DELVE_API_KEY = oldKey;
  }
});
