import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveBonfiresAgentId } from './config.js';

type AgentState = {
  last_attempt_at?: string;
  last_success_at?: string;
  last_status?: string;
  consecutive_failures?: number;
};

type HeartbeatState = {
  agents: Record<string, AgentState>;
  recovery?: Record<string, { last_dedupe_key?: string; last_recovered_at?: string }>;
};

type SessionMessage = { role: string; content: string };
type RecoverySession = {
  sessionKey: string;
  agentId?: string;
  messages?: SessionMessage[];
  ended?: boolean;
  lastActivityAtMs?: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadState(path: string): HeartbeatState {
  try {
    const loaded = JSON.parse(readFileSync(path, 'utf8'));
    return {
      agents: loaded?.agents ?? {},
      recovery: loaded?.recovery ?? {},
    };
  } catch {
    return { agents: {}, recovery: {} };
  }
}

function saveState(path: string, state: HeartbeatState) {
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function makeDedupeKey(sessionKey: string, startIndex: number, endIndex: number) {
  return `${sessionKey}:${startIndex}-${endIndex}`;
}

export function computeRecoveryRange(lastPushedIndex: number, totalMessages: number) {
  const startIndex = Math.max(0, (Number.isFinite(lastPushedIndex) ? lastPushedIndex : -1) + 1);
  const endIndex = totalMessages - 1;
  if (endIndex <= lastPushedIndex) return null;
  if (startIndex > endIndex) return null;
  return { startIndex, endIndex };
}

export function inactivityCloseTimeoutMs(throttleMinutes: number) {
  return Math.max(1, Number(throttleMinutes) || 1) * 2 * 60_000;
}

export function isRetriableErrorMessage(msg: string) {
  return /HTTP (429|5\d\d)/.test(msg) || /abort|network|fetch|timeout/i.test(msg);
}

function getRetryDelaysMs(cfg: any) {
  const custom = cfg?.network?.retryBackoffMs;
  if (Array.isArray(custom) && custom.length >= 2) {
    const first = Number(custom[0]);
    const second = Number(custom[1]);
    if (Number.isFinite(first) && first >= 0 && Number.isFinite(second) && second >= 0) {
      return [0, first, second];
    }
  }
  return [0, 5000, 15000];
}

export async function runProcessStackWithRetry(opts: {
  agentId: string;
  client: any;
  cfg: any;
  logger?: { warn?: (m: string) => void };
  sleepFn?: (ms: number) => Promise<any>;
}) {
  const delays = getRetryDelaysMs(opts.cfg);
  const sleepFn = opts.sleepFn ?? sleep;
  let lastError: any = null;

  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleepFn(delays[i]);
    try {
      await opts.client.processStack?.({ agentId: opts.agentId });
      return { ok: true, attempts: i + 1, lastError: null };
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message ?? e);
      if (!isRetriableErrorMessage(msg) || i === delays.length - 1) {
        opts.logger?.warn?.(`[heartbeat] process failed agent=${opts.agentId} err=${msg}`);
        return { ok: false, attempts: i + 1, lastError: e };
      }
    }
  }

  return { ok: false, attempts: delays.length, lastError };
}

export async function runRecoveryTick(opts: {
  cfg: any;
  client: any;
  ledger: { get: (k: string) => any; set: (k: string, v: any) => void };
  sessions: RecoverySession[];
  logger?: { warn?: (m: string) => void };
  state?: HeartbeatState;
  nowMs?: () => number;
}) {
  const nowMs = opts.nowMs ?? (() => Date.now());
  const now = nowMs();
  const closeTimeoutMs = inactivityCloseTimeoutMs(opts.cfg?.capture?.throttleMinutes ?? 15);

  for (const session of opts.sessions ?? []) {
    const sessionKey = session?.sessionKey;
    if (!sessionKey) continue;

    const bonfiresAgentId = resolveBonfiresAgentId(opts.cfg, session?.agentId);
    if (!bonfiresAgentId) continue;

    const msgs = Array.isArray(session.messages) ? session.messages : [];
    if (!msgs.length) continue;

    const inactiveLongEnough = typeof session.lastActivityAtMs === 'number'
      ? (now - session.lastActivityAtMs) >= closeTimeoutMs
      : true;
    const eligibleForFlush = Boolean(session.ended) || inactiveLongEnough;
    if (!eligibleForFlush) continue;

    const latestBefore = opts.ledger.get(sessionKey) ?? {};
    const range = computeRecoveryRange(Number(latestBefore.lastPushedIndex ?? -1), msgs.length);
    if (!range) continue;

    const dedupeKey = makeDedupeKey(sessionKey, range.startIndex, range.endIndex);
    try {
      await opts.client.capture({
        agentId: bonfiresAgentId,
        sessionKey,
        messages: msgs.slice(range.startIndex, range.endIndex + 1),
      });

      const latestAfter = opts.ledger.get(sessionKey) ?? {};
      const mergedLastPushedIndex = Math.max(Number(latestAfter.lastPushedIndex ?? -1), range.endIndex);
      opts.ledger.set(sessionKey, {
        ...latestAfter,
        lastPushedAt: now,
        lastPushedIndex: mergedLastPushedIndex,
      });

      if (opts.state) {
        opts.state.recovery = opts.state.recovery ?? {};
        opts.state.recovery[sessionKey] = {
          last_dedupe_key: dedupeKey,
          last_recovered_at: new Date(now).toISOString(),
        };
      }
    } catch (e: any) {
      opts.logger?.warn?.(`[heartbeat] recovery failed session=${sessionKey} err=${e?.message ?? e}`);
    }
  }
}

export function startStackHeartbeat(opts: {
  cfg: any;
  client: any;
  ledger?: { get: (k: string) => any; set: (k: string, v: any) => void };
  logger?: { warn?: (m: string) => void };
  statePath: string;
  recoverySource?: () => Promise<RecoverySession[]> | RecoverySession[];
  nowMs?: () => number;
  sleepFn?: (ms: number) => Promise<any>;
}) {
  const baseMs = 20 * 60 * 1000;
  const jitterMaxMs = 120 * 1000;

  mkdirSync(dirname(opts.statePath), { recursive: true });
  const state: HeartbeatState = loadState(opts.statePath);

  let stopped = false;

  async function runAgent(agentId: string) {
    const entry = state.agents[agentId] ?? { consecutive_failures: 0 };
    entry.last_attempt_at = new Date((opts.nowMs ?? Date.now)()).toISOString();

    const out = await runProcessStackWithRetry({
      agentId,
      client: opts.client,
      cfg: opts.cfg,
      logger: opts.logger,
      sleepFn: opts.sleepFn,
    });

    if (out.ok) {
      entry.last_success_at = new Date((opts.nowMs ?? Date.now)()).toISOString();
      entry.last_status = 'success';
      entry.consecutive_failures = 0;
    } else {
      entry.last_status = 'failed';
      entry.consecutive_failures = (entry.consecutive_failures ?? 0) + 1;
    }

    state.agents[agentId] = entry;
    saveState(opts.statePath, state);
  }

  async function runRecovery() {
    if (!opts.recoverySource || !opts.ledger) return;
    const sessions = await opts.recoverySource();
    await runRecoveryTick({
      cfg: opts.cfg,
      client: opts.client,
      ledger: opts.ledger,
      sessions: Array.isArray(sessions) ? sessions : [],
      logger: opts.logger,
      state,
      nowMs: opts.nowMs,
    });
    saveState(opts.statePath, state);
  }

  async function tick() {
    if (stopped) return;

    const mapped = Object.values(opts.cfg.agents || {}).filter((x: any) => typeof x === 'string') as string[];
    for (const agentId of mapped) await runAgent(agentId);
    await runRecovery();

    if (stopped) return;
    const jitter = Math.floor(Math.random() * jitterMaxMs);
    const next = setTimeout(tick, baseMs + jitter);
    (next as any).unref?.();
  }

  const first = setTimeout(tick, 2000);
  (first as any).unref?.();

  return () => { stopped = true; };
}
