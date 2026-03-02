import { resolveBonfiresAgentId } from '../config.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

export async function bonfiresSearchTool(params, ctx, deps){
  if(!params?.query || typeof params.query !== 'string') throw new Error('query is required');
  const agent=resolveBonfiresAgentId(deps.cfg, ctx.agentId);
  if(!agent){ deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`); return {results:[]}; }
  const raw=Number(params.limit ?? deps.cfg.search.maxResults);
  const limit=Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Number.isFinite(raw)?raw:deps.cfg.search.maxResults));
  return deps.client.search({agentId:agent, query:params.query, limit});
}
