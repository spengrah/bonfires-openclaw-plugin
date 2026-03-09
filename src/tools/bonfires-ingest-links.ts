import type { BonfiresClient } from '../bonfires-client.js';
import { approvalStore, type ApprovalScope } from '../approval-store.js';
import { ingestLink } from './bonfires-ingest-link.js';

export type ApprovalTokenContext = {
  approvalToken: string;
};

export type MultiLinkIngestionResult = {
  url: string;
  route: string;
  success: boolean;
  duplicate: boolean;
  error?: string;
};

export type MultiLinkIngestionSummary = {
  requested: number;
  ingested: number;
  duplicates: number;
  blocked: number;
  failed: number;
};

function approvalScopeFromToolContext(toolCtx: any): ApprovalScope {
  return {
    agentId: typeof toolCtx?.agentId === 'string' ? toolCtx.agentId : undefined,
    sessionId: typeof toolCtx?.sessionId === 'string' ? toolCtx.sessionId : undefined,
    sessionKey: typeof toolCtx?.sessionKey === 'string' ? toolCtx.sessionKey : undefined,
  };
}

export function validateApprovalTokenContext(
  approvalContext: any,
  toolCtx: any,
  nowMs = Date.now(),
): { ok: true; approvedUrls: string[] } | { ok: false; error: string } {
  if (!approvalContext || typeof approvalContext !== 'object') {
    return { ok: false, error: 'approvalContext is required' };
  }
  if (Array.isArray(approvalContext.approvedUrls)) {
    return { ok: false, error: 'approvalContext.approvedUrls is not accepted for execution; use approvalToken only' };
  }
  if ('approvedByUser' in approvalContext) {
    return { ok: false, error: 'approvalContext.approvedByUser is not accepted for execution; use approvalToken only' };
  }
  const token = typeof approvalContext.approvalToken === 'string' ? approvalContext.approvalToken : '';
  const resolved = approvalStore.resolveApprovalToken(approvalScopeFromToolContext(toolCtx), token, nowMs);
  if (resolved.ok === false) return resolved;
  return { ok: true, approvedUrls: resolved.approvedUrls };
}

export async function bonfiresIngestLinksTool(
  params: { approvalContext?: ApprovalTokenContext; urls?: string[] },
  toolCtx: any,
  deps: { cfg: any; client: BonfiresClient; logger?: { warn?: (msg: string) => void }; nowMs?: () => number },
): Promise<{ results?: MultiLinkIngestionResult[]; summary?: MultiLinkIngestionSummary; success?: false; error?: string }> {
  if (Array.isArray((params as any)?.urls)) {
    return { success: false, error: 'urls field is not accepted; execution requires approvalContext.approvalToken' };
  }

  const validated = validateApprovalTokenContext(params?.approvalContext, toolCtx, deps.nowMs ? deps.nowMs() : Date.now());
  if (validated.ok === false) {
    return { success: false, error: validated.error };
  }

  const results: MultiLinkIngestionResult[] = [];
  for (const url of validated.approvedUrls) {
    const result = await ingestLink(url, deps.client, deps.logger);
    results.push({
      url: result.url,
      route: result.route,
      success: result.success,
      duplicate: result.duplicate,
      error: result.error,
    });
  }

  const summary: MultiLinkIngestionSummary = {
    requested: validated.approvedUrls.length,
    ingested: results.filter((r) => r.success && !r.duplicate).length,
    duplicates: results.filter((r) => r.duplicate).length,
    blocked: results.filter((r) => !r.success && r.route === 'none').length,
    failed: results.filter((r) => !r.success && r.route !== 'none').length,
  };

  return { results, summary };
}
