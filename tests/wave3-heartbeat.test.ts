import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeRecoveryRange,
  inactivityCloseTimeoutMs,
  isRetriableErrorMessage,
  makeDedupeKey,
  runProcessStackWithRetry,
  runRecoveryTick,
  startStackHeartbeat,
} from '../src/heartbeat.js';

const cfg = {
  agents: { agent_primary: 'agent-primary', agent_secondary: 'agent-secondary' },
  processing: { intervalMinutes: 20 },
  network: { retryBackoffMs: [0, 0] },
};

test('wave3: recovery overlap precedence uses endIndex guard and dedupe key identity', async () => {
  const ledgerMap = new Map<string, any>();
  ledgerMap.set('s-overlap', { lastPushedAt: 1, lastPushedIndex: 1 });

  const captureCalls: any[] = [];
  const client = {
    capture: async (req: any) => {
      captureCalls.push(req);
      return { accepted: req.messages.length };
    },
  };

  await runRecoveryTick({
    cfg,
    client,
    ledger: {
      get: (k: string) => ledgerMap.get(k),
      set: (k: string, v: any) => { ledgerMap.set(k, v); },
    },
    sessions: [
      {
        sessionKey: 's-overlap',
        agentId: 'agent_primary',
        ended: true,
        messages: [
          { role: 'user', content: 'm0' },
          { role: 'assistant', content: 'm1' },
          { role: 'user', content: 'm2' },
          { role: 'assistant', content: 'm3' },
        ],
      },
    ],
    state: { agents: {}, recovery: {} },
    nowMs: () => 10_000,
  });

  assert.equal(captureCalls.length, 1);
  assert.equal(captureCalls[0].messages.length, 2);
  assert.equal(captureCalls[0].messages[0].content, 'm2');
  assert.equal(ledgerMap.get('s-overlap').lastPushedIndex, 3);

  // endIndex <= lastPushedIndex guard prevents duplicate re-push
  await runRecoveryTick({
    cfg,
    client,
    ledger: {
      get: (k: string) => ledgerMap.get(k),
      set: (k: string, v: any) => { ledgerMap.set(k, v); },
    },
    sessions: [
      {
        sessionKey: 's-overlap',
        agentId: 'agent_primary',
        ended: true,
        messages: [
          { role: 'user', content: 'm0' },
          { role: 'assistant', content: 'm1' },
          { role: 'user', content: 'm2' },
          { role: 'assistant', content: 'm3' },
        ],
      },
    ],
    nowMs: () => 12_000,
  });

  assert.equal(captureCalls.length, 1);
  assert.equal(makeDedupeKey('s-overlap', 2, 3), 's-overlap:2-3');
});

test('wave3: close-timeout formula is canonical 2 * processing.intervalMinutes', async () => {
  assert.equal(inactivityCloseTimeoutMs(20), 40 * 60_000);
  assert.equal(inactivityCloseTimeoutMs(10), 20 * 60_000);
});

test('wave3: recovery skips sessions that are not ended and not inactive long enough', async () => {
  const ledgerMap = new Map<string, any>();
  const client = {
    capture: async () => ({ accepted: 1 }),
  };
  let called = false;
  const wrappedClient = {
    capture: async (...args: any[]) => {
      called = true;
      return (client.capture as any)(...args);
    },
  };

  await runRecoveryTick({
    cfg,
    client: wrappedClient,
    ledger: {
      get: (k: string) => ledgerMap.get(k),
      set: (k: string, v: any) => { ledgerMap.set(k, v); },
    },
    sessions: [
      {
        sessionKey: 's-active',
        agentId: 'agent_primary',
        lastActivityAtMs: 100_000,
        messages: [{ role: 'user', content: 'recent' }],
      },
    ],
    nowMs: () => 100_000 + (5 * 60_000),
  });

  assert.equal(called, false);
});

test('wave3: process stack retry policy retries retriable failures and stops on non-retriable', async () => {
  const delays: number[] = [];
  let calls = 0;

  const retriableThenSuccess = {
    processStack: async () => {
      calls += 1;
      if (calls < 3) throw new Error('Bonfires /stack/process failed: HTTP 500');
      return { success: true };
    },
  };

  const retryCfg = { ...cfg, network: { retryBackoffMs: [1, 2] } };

  const ok = await runProcessStackWithRetry({
    agentId: 'agent-primary',
    client: retriableThenSuccess,
    cfg: retryCfg,
    sleepFn: async (ms: number) => { delays.push(ms); },
  });

  assert.equal(ok.ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1, 2]);

  calls = 0;
  delays.length = 0;
  const nonRetriable = {
    processStack: async () => {
      calls += 1;
      throw new Error('Bonfires /stack/process failed: HTTP 400');
    },
  };

  const fail = await runProcessStackWithRetry({
    agentId: 'agent-primary',
    client: nonRetriable,
    cfg: retryCfg,
    sleepFn: async (ms: number) => { delays.push(ms); },
  });

  assert.equal(fail.ok, false);
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test('wave3: recovery range helper and retriable classifier behave deterministically', async () => {
  assert.deepEqual(computeRecoveryRange(-1, 3), { startIndex: 0, endIndex: 2 });
  assert.deepEqual(computeRecoveryRange(1, 4), { startIndex: 2, endIndex: 3 });
  assert.equal(computeRecoveryRange(3, 4), null);
  assert.equal(isRetriableErrorMessage('HTTP 429'), true);
  assert.equal(isRetriableErrorMessage('HTTP 503'), true);
  assert.equal(isRetriableErrorMessage('HTTP 400'), false);
});

test('wave3: recovery capture failure is fail-open and logs warning', async () => {
  let warned = false;
  const ledgerMap = new Map<string, any>();
  await runRecoveryTick({
    cfg,
    client: {
      capture: async () => { throw new Error('capture-fail'); },
    },
    ledger: {
      get: (k: string) => ledgerMap.get(k),
      set: (k: string, v: any) => { ledgerMap.set(k, v); },
    },
    sessions: [{ sessionKey: 's-recovery-fail', agentId: 'agent_primary', ended: true, messages: [{ role: 'user', content: 'x' }] }],
    logger: { warn: () => { warned = true; } },
    nowMs: () => 123,
  });

  assert.equal(warned, true);
  assert.equal(ledgerMap.get('s-recovery-fail'), undefined);
});

test('wave3: startStackHeartbeat runs first tick, persists state, and supports stop', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bonfires-heartbeat-'));
  const statePath = join(dir, 'hb-state.json');
  const ledgerMap = new Map<string, any>();
  const processCalls: string[] = [];
  const captureCalls: any[] = [];

  const oldSetTimeout = globalThis.setTimeout;
  const oldRandom = Math.random;
  let firstTickScheduled = false;

  (globalThis as any).setTimeout = ((fn: any, ms: number) => {
    const handle = { unref: () => {} };
    if (!firstTickScheduled && ms === 2000) {
      firstTickScheduled = true;
      Promise.resolve().then(() => fn());
    }
    return handle;
  }) as any;
  Math.random = () => 0;

  try {
    const stop = startStackHeartbeat({
      cfg,
      client: {
        processStack: async ({ agentId }: any) => {
          processCalls.push(agentId);
          return { success: true };
        },
        capture: async (req: any) => {
          captureCalls.push(req);
          return { accepted: req.messages.length };
        },
      },
      ledger: {
        get: (k: string) => ledgerMap.get(k),
        set: (k: string, v: any) => { ledgerMap.set(k, v); },
      },
      recoverySource: () => ([
        { sessionKey: 's-heartbeat', agentId: 'agent_primary', ended: true, messages: [{ role: 'user', content: 'm0' }] },
      ]),
      statePath,
      nowMs: () => 10_000,
      sleepFn: async () => {},
    });

    await new Promise((r) => oldSetTimeout(r, 0));
    stop();

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(processCalls.length >= 2, true); // mapped agents (agent_primary + agent_secondary)
    assert.equal(captureCalls.length, 1);
    assert.equal(state.agents['agent-primary'].last_status, 'success');
    assert.equal(typeof state.recovery['s-heartbeat'].last_dedupe_key, 'string');
  } finally {
    (globalThis as any).setTimeout = oldSetTimeout;
    Math.random = oldRandom;
    rmSync(dir, { recursive: true, force: true });
  }
});
