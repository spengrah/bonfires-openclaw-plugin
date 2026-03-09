import { randomBytes } from 'node:crypto';

export type ApprovalScope = {
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
};

export type ApprovalCandidateSource = 'user-shared-links' | 'discover_links';

export type ApprovalCandidateSet = {
  source: ApprovalCandidateSource;
  urls: string[];
  createdAtMs: number;
};

export type ApprovalTokenRecord = {
  token: string;
  urls: string[];
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
  mintedAtMs: number;
  expiresAtMs: number;
};

const DEFAULT_TOKEN_TTL_MS = 10 * 60_000;

function normalizeUrlSet(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const normalized = new URL(trimmed).toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(normalized);
      }
    } catch {
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
  }
  return out;
}

function scopeKey(scope: ApprovalScope): string | null {
  if (!scope || typeof scope !== 'object') return null;
  const agentId = typeof scope.agentId === 'string' && scope.agentId.trim() ? scope.agentId.trim() : '';
  const sessionId = typeof scope.sessionId === 'string' && scope.sessionId.trim() ? scope.sessionId.trim() : '';
  const sessionKey = typeof scope.sessionKey === 'string' && scope.sessionKey.trim() ? scope.sessionKey.trim() : '';
  if (!agentId) return null;
  if (sessionId) return `agent:${agentId}:session:${sessionId}`;
  if (sessionKey) return `agent:${agentId}:sessionKey:${sessionKey}`;
  return null;
}

function sameScope(a: ApprovalScope, b: ApprovalScope): boolean {
  const ka = scopeKey(a);
  const kb = scopeKey(b);
  return ka !== null && ka === kb;
}

export class ApprovalStore {
  private readonly candidateSets = new Map<string, ApprovalCandidateSet[]>();
  private readonly tokens = new Map<string, ApprovalTokenRecord>();

  recordCandidateUrls(scope: ApprovalScope, source: ApprovalCandidateSource, urls: string[], nowMs = Date.now()): { ok: true; recorded: number } | { ok: false; error: string } {
    const key = scopeKey(scope);
    if (!key) return { ok: false, error: 'approval scope is unavailable for this session' };
    const normalized = normalizeUrlSet(urls);
    if (normalized.length === 0) return { ok: true, recorded: 0 };
    const existing = this.candidateSets.get(key) ?? [];
    existing.push({ source, urls: normalized, createdAtMs: nowMs });
    this.candidateSets.set(key, existing.slice(-20));
    return { ok: true, recorded: normalized.length };
  }

  mintApprovalToken(scope: ApprovalScope, urls: string[], opts?: { nowMs?: number; ttlMs?: number }): { ok: true; token: string; approvedUrls: string[]; expiresAtMs: number } | { ok: false; error: string } {
    const key = scopeKey(scope);
    if (!key) return { ok: false, error: 'approval token minting requires a session-bound tool context' };
    const approvedUrls = normalizeUrlSet(urls);
    if (approvedUrls.length === 0) return { ok: false, error: 'approvedUrls must be a non-empty array' };

    const known = this.candidateSets.get(key) ?? [];
    const knownUrls = new Set(known.flatMap((set) => set.urls));
    for (const url of approvedUrls) {
      if (!knownUrls.has(url)) {
        return { ok: false, error: 'approvedUrls must be drawn from links already observed in this session' };
      }
    }

    const nowMs = Number(opts?.nowMs ?? Date.now());
    const ttlMs = Math.max(1, Number(opts?.ttlMs ?? DEFAULT_TOKEN_TTL_MS));
    const token = `bat_${randomBytes(16).toString('hex')}`;
    const record: ApprovalTokenRecord = {
      token,
      urls: approvedUrls,
      agentId: scope.agentId,
      sessionId: scope.sessionId,
      sessionKey: scope.sessionKey,
      mintedAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
    };
    this.tokens.set(token, record);
    return { ok: true, token, approvedUrls, expiresAtMs: record.expiresAtMs };
  }

  resolveApprovalToken(scope: ApprovalScope, token: string, nowMs = Date.now()): { ok: true; approvedUrls: string[]; expiresAtMs: number } | { ok: false; error: string } {
    if (typeof token !== 'string' || !token.trim()) return { ok: false, error: 'approvalToken is required' };
    const record = this.tokens.get(token.trim());
    if (!record) return { ok: false, error: 'approvalToken is invalid, expired, or unverifiable' };
    if (record.expiresAtMs < nowMs) {
      this.tokens.delete(record.token);
      return { ok: false, error: 'approvalToken is invalid, expired, or unverifiable' };
    }
    if (!sameScope(scope, record)) {
      return { ok: false, error: 'approvalToken is invalid, expired, or unverifiable' };
    }
    return { ok: true, approvedUrls: [...record.urls], expiresAtMs: record.expiresAtMs };
  }

  reset(): void {
    this.candidateSets.clear();
    this.tokens.clear();
  }
}

export const approvalStore = new ApprovalStore();
export const approvalStoreInternals = { normalizeUrlSet, scopeKey };
