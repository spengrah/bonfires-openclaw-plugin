import { resolveBonfiresAgentId } from '../config.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

export async function bonfiresStackSearchTool(params, ctx, deps) {
  if (!params?.query || typeof params.query !== 'string') throw new Error('query is required');
  const agent = resolveBonfiresAgentId(deps.cfg, ctx.agentId);
  if (!agent) { deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`); return { results: [], count: 0, query: params.query }; }
  const raw = Number(params.limit ?? 10);
  const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Number.isFinite(raw) ? raw : 10));
  return deps.client.stackSearch({ agentId: agent, query: params.query, limit });
}
