export interface BonfiresClient {
  search(req: { agentId: string; query: string; limit: number }): Promise<{ results: Array<{ summary: string; source: string; score: number }> }>;
  capture(req: { agentId: string; sessionKey: string; messages: Array<{ role: string; content: string }> }): Promise<{ accepted: number }>;
  processStack?(req: { agentId: string }): Promise<{ success: boolean; message_count?: number }>;
  ingestContent?(req: { sourcePath: string; content: string; contentHash: string; metadata?: Record<string, any> }): Promise<{ accepted: number }>;
}

export class MockBonfiresClient implements BonfiresClient {
  searchCalls: any[];
  captureCalls: any[];
  shouldThrowSearch: boolean;

  constructor() {
    this.searchCalls = [];
    this.captureCalls = [];
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

  async processStack() {
    return { success: true, message_count: 0 };
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
        num_results: req.limit,
      }),
    });

    const episodes = Array.isArray(body.episodes) ? body.episodes : [];
    const entities = Array.isArray(body.entities) ? body.entities : [];

    const fromEpisodes = episodes.map((e: any, i: number) => {
      let summary = e.summary as string | null;
      if (!summary && e.content) {
        try { const p = JSON.parse(e.content); summary = p.content ?? p.name ?? null; } catch { summary = String(e.content); }
      }
      return { summary: String(summary ?? e.name ?? 'Episode').replace(/\n/g, ' '), source: `delve:episode:${i}`, score: Math.max(0, 1 - i * 0.05) };
    });
    const fromEntities = entities.map((e: any, i: number) => ({
      summary: String(e.summary ?? e.name ?? 'Entity').replace(/\n/g, ' '),
      source: `delve:entity:${i}`,
      score: Math.max(0, 0.8 - i * 0.05),
    }));

    return { results: [...fromEpisodes, ...fromEntities].slice(0, req.limit) };
  }

  private extractText(m: { role: string; content: any }): string {
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content))
      return m.content.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n');
    return String(m.content ?? '');
  }

  private toStackMsg(m: { role: string; content: any }, sessionKey: string) {
    const text = this.extractText(m);
    if (!text) return null;
    return { text, userId: m.role, chatId: sessionKey, role: m.role, content: text, timestamp: new Date().toISOString() };
  }

  async capture(req: { agentId: string; sessionKey: string; messages: Array<{ role: string; content: string }> }) {
    this.validateAgentId(req.agentId);
    if (!req.messages.length) return { accepted: 0 };

    // Build paired user+assistant messages
    let accepted = 0;
    let i = 0;
    while (i < req.messages.length) {
      const m = req.messages[i];
      const next = i + 1 < req.messages.length ? req.messages[i + 1] : null;

      // Try to form a pair: user + assistant
      if (m.role === 'user' && next && next.role === 'assistant') {
        const userMsg = this.toStackMsg(m, req.sessionKey);
        const assistantMsg = this.toStackMsg(next, req.sessionKey);
        if (userMsg && assistantMsg) {
          await this.fetchJson(`/agents/${encodeURIComponent(req.agentId)}/stack/add`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ messages: [userMsg, assistantMsg], is_paired: true }),
          });
          accepted += 2;
          i += 2;
          continue;
        }
      }

      // Unpaired fallback (single message)
      const msg = this.toStackMsg(m, req.sessionKey);
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
