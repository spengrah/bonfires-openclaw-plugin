export interface BonfiresClient {
  search(req: { agentId: string; query: string; limit: number }): Promise<{ results: Array<{ summary: string; source: string; score: number }> }>;
  capture(req: { agentId: string; sessionKey: string; messages: Array<{ role: string; content: string }> }): Promise<{ accepted: number }>;
  processStack?(req: { agentId: string }): Promise<{ success: boolean; message_count?: number }>;
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
    const controller = new AbortController();
    const timeoutMs = this.cfg.network?.timeoutMs ?? 12000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      let body: any = {};
      try { body = await res.json(); } catch {}
      if (!res.ok) throw new Error(`Bonfires ${path} failed: HTTP ${res.status}`);
      return body;
    } finally {
      clearTimeout(t);
    }
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

    const fromEpisodes = episodes.map((e: any, i: number) => ({
      summary: String(e.summary ?? e.content ?? e.name ?? 'Episode'),
      source: `delve:episode:${i}`,
      score: Math.max(0, 1 - i * 0.05),
    }));
    const fromEntities = entities.map((e: any, i: number) => ({
      summary: String(e.summary ?? e.name ?? 'Entity'),
      source: `delve:entity:${i}`,
      score: Math.max(0, 0.8 - i * 0.05),
    }));

    return { results: [...fromEpisodes, ...fromEntities].slice(0, req.limit) };
  }

  async capture(req: { agentId: string; sessionKey: string; messages: Array<{ role: string; content: string }> }) {
    this.validateAgentId(req.agentId);
    if (!req.messages.length) return { accepted: 0 };

    let accepted = 0;
    for (const m of req.messages) {
      const body = {
        message: {
          text: m.content,
          userId: m.role,
          chatId: req.sessionKey,
          timestamp: new Date().toISOString(),
        },
      };

      await this.fetchJson(`/agents/${encodeURIComponent(req.agentId)}/stack/add`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      accepted += 1;
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
}

export function createBonfiresClient(cfg: any, logger?: { warn?: (msg: string) => void }): BonfiresClient {
  const hasKey = Boolean(process.env[cfg.apiKeyEnv]);
  if (hasKey && cfg.bonfireId) return new HostedBonfiresClient(cfg, logger);
  logger?.warn?.(`Using MockBonfiresClient (missing env ${cfg.apiKeyEnv} or bonfireId)`);
  return new MockBonfiresClient();
}
