import { extractUserMessage } from './hooks.js';

export interface BonfiresClient {
  search(req: { agentId: string; query: string; limit: number }): Promise<{ results: Array<{ summary: string; source: string; score: number }> }>;
  capture(req: { agentId: string; sessionKey: string; sessionId?: string; messages: Array<{ role: string; content: string }> }): Promise<{ accepted: number }>;
  processStack?(req: { agentId: string }): Promise<{ success: boolean; message_count?: number }>;
  stackSearch?(req: { agentId: string; query: string; limit?: number }): Promise<{ results: any[]; count: number; query: string }>;
  ingestContent?(req: { sourcePath: string; content: string; contentHash: string; metadata?: Record<string, any> }): Promise<{ accepted: number }>;
}

export class MockBonfiresClient implements BonfiresClient {
  searchCalls: any[];
  captureCalls: any[];
  shouldThrowSearch: boolean;
  processStackCalls: any[];
  stackSearchCalls: any[];

  constructor() {
    this.searchCalls = [];
    this.captureCalls = [];
    this.processStackCalls = [];
    this.stackSearchCalls = [];
    this.shouldThrowSearch = false;
  }

  async search(req: any) {
    this.searchCalls.push(req);
    if (this.shouldThrowSearch) throw new Error('mock search error');
    const n = Math.max(1, req.limit || 1);
    return {
      results: Array.from({ length: n }).map((_, i) => ({
        summary: `Mock memory ${i + 1} for: ${req.query.slice(0, 40)}`,
        source: `mock://bonfires/${i + 1}`,
        score: Math.max(0, 1 - i * 0.1),
      })),
    };
  }

  async capture(req: any) {
    this.captureCalls.push(req);
    return { accepted: req.messages.length };
  }

  async processStack(req?: any) {
    this.processStackCalls.push(req ?? {});
    return { success: true, message_count: 0 };
  }

  async stackSearch(req: any) {
    this.stackSearchCalls.push(req);
    return { results: [], count: 0, query: req.query };
  }

  async ingestContent(_req: { sourcePath: string; content: string; contentHash: string; metadata?: Record<string, any> }) {
    return { accepted: 1 };
  }
}

export class HostedBonfiresClient implements BonfiresClient {
  constructor(private cfg: any, private logger?: { warn?: (msg: string) => void }) {}

  private validateAgentId(agentId: string) {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(agentId)) throw new Error('Invalid agentId format');
  }

  private headers() {
    const key = process.env[this.cfg.apiKeyEnv];
    if (!key) throw new Error(`Missing API key env: ${this.cfg.apiKeyEnv}`);
    return {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
  }

  private async fetchJson(path: string, init: any) {
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}${path}`;
    const timeoutMs = this.cfg.network?.timeoutMs ?? 12000;
    const configuredBackoff = this.cfg.network?.retryBackoffMs;
    const delays = Array.isArray(configuredBackoff)
      && configuredBackoff.length >= 2
      && Number.isFinite(Number(configuredBackoff[0]))
      && Number.isFinite(Number(configuredBackoff[1]))
      ? [0, Number(configuredBackoff[0]), Number(configuredBackoff[1])]
      : [0, 5000, 15000];

    let lastErr: any = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        let body: any = {};
        try { body = await res.json(); } catch {}
        if (!res.ok) {
          const retriable = res.status === 429 || (res.status >= 500 && res.status <= 599);
          const err = new Error(`Bonfires ${path} failed: HTTP ${res.status}`);
          if (!retriable || i === delays.length - 1) throw err;
          lastErr = err;
          continue;
        }
        return body;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? e);
        const retriable = /HTTP (429|5\d\d)/.test(msg) || /abort|network|fetch/i.test(msg);
        if (!retriable || i === delays.length - 1) throw e;
      } finally {
        clearTimeout(t);
      }
    }
    throw lastErr ?? new Error(`Bonfires ${path} failed`);
  }

  async search(req: { agentId: string; query: string; limit: number }) {
    this.validateAgentId(req.agentId);
    const body = await this.fetchJson('/delve', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        query: req.query,
        bonfire_id: this.cfg.bonfireId,
        agent_id: req.agentId,
        num_results: req.limit,
      }),
    });

    const episodes = Array.isArray(body.episodes) ? body.episodes : [];
    const entities = Array.isArray(body.entities) ? body.entities : [];

    const fromEpisodes = episodes.map((e: any, i: number) => {
      let summary: string | null = typeof e.summary === 'string' ? e.summary : null;
      if (!summary && e.content) {
        let obj: any = null;
        if (typeof e.content === 'object') {
          obj = e.content;
        } else if (typeof e.content === 'string') {
          try { obj = JSON.parse(e.content); } catch { summary = e.content; }
        }
        if (obj && !summary) {
          summary = (typeof obj.content === 'string' ? obj.content : null)
                 ?? (typeof obj.name === 'string' ? obj.name : null)
                 ?? null;
        }
      }
      const name = typeof e.name === 'string' ? e.name : 'Episode';
      return { summary: String(summary ?? name).replace(/\n/g, ' '), source: `delve:episode:${i}`, score: Math.max(0, 1 - i * 0.05) };
    });
    const fromEntities = entities.map((e: any, i: number) => ({
      summary: String(
        (typeof e.summary === 'string' ? e.summary : null)
        ?? (typeof e.name === 'string' ? e.name : null)
        ?? 'Entity'
      ).replace(/\n/g, ' '),
      source: `delve:entity:${i}`,
      score: Math.max(0, 0.8 - i * 0.05),
    }));

    return { results: [...fromEpisodes, ...fromEntities].slice(0, req.limit) };
  }

  /** Strip leading Bonfires context injection from user messages to prevent feedback loop. */
  private stripPrependContext(text: string): string {
    const pattern = /^--- Bonfires context ---\n(?:- [^\n]*\n)*---\n?/;
    return text.replace(pattern, '').trim();
  }

  /** Extract sender identity from OpenClaw metadata wrapper. Returns name or null. */
  private extractSenderFromMetadata(text: string): string | null {
    const senderPattern = /Sender \(untrusted metadata\):\s*\n```json\s*\n(\{[^}]*\})\s*\n```/;
    const match = senderPattern.exec(text);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[1]);
      return parsed.name || parsed.username || parsed.id || null;
    } catch { return null; }
  }

  /** Extract text from user message content (string or content block array). */
  private extractUserText(m: { role: string; content: any }): string {
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content))
      return m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    return (m.content != null && typeof m.content === 'object') ? JSON.stringify(m.content) : String(m.content ?? '');
  }

  /** Extract clean text from assistant message, filtering out thinking/toolCall blocks and [[directive]] prefixes. */
  private extractAssistantText(m: { role: string; content: any }): string {
    if (typeof m.content === 'string') return m.content.replace(/^\[\[[^\]]*\]\]\s*/, '');
    if (Array.isArray(m.content)) {
      return m.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => String(b.text ?? '').replace(/^\[\[[^\]]*\]\]\s*/, ''))
        .join('\n')
        .trim();
    }
    return (m.content != null && typeof m.content === 'object') ? JSON.stringify(m.content) : String(m.content ?? '');
  }

  private toStackMsg(m: { role: string; content: any }, chatId: string, agentName?: string) {
    let text: string;
    let userId: string;
    let username: string;
    const role: 'user' | 'assistant' = m.role === 'user' ? 'user' : 'assistant';

    if (m.role === 'user') {
      text = this.extractUserText(m);
      text = this.stripPrependContext(text);
      const senderName = this.extractSenderFromMetadata(text) ?? 'user';
      userId = senderName;
      username = senderName;
      text = extractUserMessage(text);
    } else {
      text = this.extractAssistantText(m);
      userId = agentName ?? 'assistant';
      username = agentName ?? 'assistant';
    }

    if (!text) return null;
    return { text, userId, chatId, timestamp: new Date().toISOString(), role, username };
  }

  async capture(req: { agentId: string; sessionKey: string; sessionId?: string; messages: Array<{ role: string; content: string }> }) {
    this.validateAgentId(req.agentId);
    // Only capture conversational messages — filter out toolResult, system, tool_use, etc.
    const conversational = req.messages.filter(m => m.role === 'user' || m.role === 'assistant');
    if (!conversational.length) return { accepted: 0 };

    // Use agentId as the assistant userId
    const agentName = req.agentId;
    // PM12: Use sessionId as chatId, fall back to sessionKey
    const chatId = req.sessionId || req.sessionKey;

    // Build paired user+assistant messages
    let accepted = 0;
    let i = 0;
    while (i < conversational.length) {
      const m = conversational[i];
      const next = i + 1 < conversational.length ? conversational[i + 1] : null;

      // Try to form a pair: user + assistant
      if (m.role === 'user' && next && next.role === 'assistant') {
        const userMsg = this.toStackMsg(m, chatId, agentName);
        const assistantMsg = this.toStackMsg(next, chatId, agentName);
        if (userMsg && assistantMsg) {
          const _payload = { messages: [userMsg, assistantMsg], is_paired: true };
          await this.fetchJson(`/agents/${encodeURIComponent(req.agentId)}/stack/add`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(_payload),
          });
          accepted += 2;
          i += 2;
          continue;
        }
      }

      // Unpaired fallback (single message)
      const msg = this.toStackMsg(m, chatId, agentName);
      if (msg) {
        await this.fetchJson(`/agents/${encodeURIComponent(req.agentId)}/stack/add`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ message: msg }),
        });
        accepted += 1;
      }
      i += 1;
    }

    return { accepted };
  }

  async processStack(req: { agentId: string }) {
    this.validateAgentId(req.agentId);
    const body = await this.fetchJson(`/agents/${encodeURIComponent(req.agentId)}/stack/process`, {
      method: 'POST',
      headers: this.headers(),
    });
    return { success: Boolean(body.success ?? true), message_count: body.message_count };
  }

  async stackSearch(req: { agentId: string; query: string; limit?: number }) {
    this.validateAgentId(req.agentId);
    const body = await this.fetchJson(`/agents/${encodeURIComponent(req.agentId)}/stack/search`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        query: req.query,
        limit: req.limit ?? 10,
      }),
    });
    return {
      results: Array.isArray(body.results) ? body.results : [],
      count: body.count ?? 0,
      query: body.query ?? req.query,
    };
  }

  async ingestContent(req: { sourcePath: string; content: string; contentHash: string; metadata?: Record<string, any> }) {
    const body = await this.fetchJson('/ingest_content', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        bonfire_id: this.cfg.bonfireId,
        source_path: req.sourcePath,
        content: req.content,
        content_hash: req.contentHash,
        metadata: req.metadata ?? {},
      }),
    });
    return { accepted: Number(body.accepted ?? 1) };
  }
}

export function createBonfiresClient(cfg: any, logger?: { warn?: (msg: string) => void }): BonfiresClient {
  const hasKey = Boolean(process.env[cfg.apiKeyEnv]);
  const strictHosted = Boolean(cfg.strictHostedMode);
  if (hasKey && cfg.bonfireId) return new HostedBonfiresClient(cfg, logger);
  if (strictHosted) throw new Error(`Hosted mode required but missing env ${cfg.apiKeyEnv} or bonfireId`);
  logger?.warn?.(`Using MockBonfiresClient (missing env ${cfg.apiKeyEnv} or bonfireId)`);
  return new MockBonfiresClient();
}
