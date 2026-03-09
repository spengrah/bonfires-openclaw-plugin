import { approvalStore } from '../approval-store.js';

export type DiscoverLinkResult = {
  title?: string;
  url: string;
  snippet?: string;
  contentTypeGuess?: string;
  confidence?: number;
};

const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/';
const DEFAULT_MAX_CANDIDATES = 10;
const MAX_CANDIDATES = 25;

function stripHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function guessContentType(url: string): string | undefined {
  const lower = url.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'text/plain';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  return undefined;
}

export function parseDiscoveryHtml(html: string, maxCandidates = DEFAULT_MAX_CANDIDATES): DiscoverLinkResult[] {
  const out: DiscoverLinkResult[] = [];
  const pattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && out.length < maxCandidates) {
    const url = stripHtml(match[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3]).slice(0, 240);
    out.push({
      title: title || undefined,
      url,
      snippet: snippet || undefined,
      contentTypeGuess: guessContentType(url),
      confidence: Math.max(0.1, Number((1 - out.length * 0.08).toFixed(2))),
    });
  }
  return out;
}

export async function discoverLinksTool(
  params: { query?: string; maxCandidates?: number },
  toolCtx: any,
  deps: { cfg: any; logger?: { warn?: (msg: string) => void } },
): Promise<{ results?: DiscoverLinkResult[]; count?: number; success?: false; error?: string }> {
  const enabled = deps.cfg?.discovery?.enabled === true;
  if (!enabled) {
    return { success: false, error: 'discover_links is disabled by feature flag' };
  }

  const query = typeof params?.query === 'string' ? params.query.trim() : '';
  if (!query) {
    return { success: false, error: 'query parameter is required' };
  }

  const requested = Number(params?.maxCandidates ?? deps.cfg?.discovery?.maxCandidates ?? DEFAULT_MAX_CANDIDATES);
  const maxCandidates = Math.min(MAX_CANDIDATES, Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_MAX_CANDIDATES));

  const controller = new AbortController();
  const timeoutMs = Number(deps.cfg?.network?.timeoutMs ?? 12000);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = new URLSearchParams({ q: query });
    const res = await fetch(DUCKDUCKGO_HTML_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'bonfires-plugin/0.1 discover-links',
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      return { success: false, error: `discover_links failed: HTTP ${res.status}` };
    }
    const html = await res.text();
    const results = parseDiscoveryHtml(html, maxCandidates);
    approvalStore.recordCandidateUrls({
      agentId: typeof toolCtx?.agentId === 'string' ? toolCtx.agentId : undefined,
      sessionId: typeof toolCtx?.sessionId === 'string' ? toolCtx.sessionId : undefined,
      sessionKey: typeof toolCtx?.sessionKey === 'string' ? toolCtx.sessionKey : undefined,
    }, 'discover_links', results.map((r) => r.url));
    return { results, count: results.length };
  } catch (e: any) {
    deps.logger?.warn?.(`discover_links error: ${e?.message ?? e}`);
    return { success: false, error: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}
