import { approvalStore, type ApprovalScope } from '../approval-store.js';

const DEFAULT_MAX_URLS_PER_RUN = 10;

function approvalScopeFromToolContext(toolCtx: any): ApprovalScope {
  return {
    agentId: typeof toolCtx?.agentId === 'string' ? toolCtx.agentId : undefined,
    sessionId: typeof toolCtx?.sessionId === 'string' ? toolCtx.sessionId : undefined,
    sessionKey: typeof toolCtx?.sessionKey === 'string' ? toolCtx.sessionKey : undefined,
  };
}

export function validateApprovalPreparationParams(
  params: any,
  maxUrlsPerRun = DEFAULT_MAX_URLS_PER_RUN,
): { ok: true; approvedUrls: string[] } | { ok: false; error: string } {
  if (!params || typeof params !== 'object') return { ok: false, error: 'approvalContext is required' };
  if (params.approvedByUser !== true) return { ok: false, error: 'approvalContext.approvedByUser must be true' };
  if (!Array.isArray(params.approvedUrls)) return { ok: false, error: 'approvalContext.approvedUrls must be a non-empty array' };
  const normalized = approvalStoreInternals.normalizeUrlSet(params.approvedUrls);
  if (normalized.length === 0) return { ok: false, error: 'approvalContext.approvedUrls must be a non-empty array' };
  if (normalized.length > maxUrlsPerRun) return { ok: false, error: `approvedUrls exceeds maxUrlsPerRun (${maxUrlsPerRun})` };
  return { ok: true, approvedUrls: normalized };
}

const approvalStoreInternals = {
  normalizeUrlSet(urls: string[]) {
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
  },
};

export async function prepareIngestApprovalTool(
  params: { approvalContext?: { approvedByUser?: true; approvedUrls?: string[] } },
  toolCtx: any,
  deps: { cfg: any; nowMs?: () => number },
): Promise<{ approvalToken?: string; approvedUrls?: string[]; expiresAtMs?: number; success?: false; error?: string }> {
  const maxUrlsPerRun = Number(deps.cfg?.ingestion?.approval?.maxUrlsPerRun ?? DEFAULT_MAX_URLS_PER_RUN);
  const validated = validateApprovalPreparationParams(params?.approvalContext, maxUrlsPerRun);
  if (validated.ok === false) return { success: false, error: validated.error };

  const minted = approvalStore.mintApprovalToken(
    approvalScopeFromToolContext(toolCtx),
    validated.approvedUrls,
    { nowMs: deps.nowMs ? deps.nowMs() : Date.now() },
  );
  if (minted.ok === false) return { success: false, error: minted.error };
  return { approvalToken: minted.token, approvedUrls: minted.approvedUrls, expiresAtMs: minted.expiresAtMs };
}
